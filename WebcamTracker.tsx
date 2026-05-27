import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Eye, EyeOff, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface WebcamTrackerProps {
  onGazeUpdate: (gx: number, gy: number, ear: number) => void;
  isActive: boolean;
}

export const WebcamTracker: React.FC<WebcamTrackerProps> = ({ onGazeUpdate, isActive }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCameraModelReady, setIsCameraModelReady] = useState(false);
  const [lightingHealth, setLightingHealth] = useState<'low' | 'good' | 'saturated'>('good');
  const [diagnosticText, setDiagnosticText] = useState<string>('Align face to engage pupil centroid tracker');

  // Interactive dynamic eye crop positions state (mirror unmirrored coordinates)
  const [leftEyeCenter, setLeftEyeCenter] = useState({ x: 115, y: 95 });
  const [rightEyeCenter, setRightEyeCenter] = useState({ x: 202, y: 95 });
  const [cropSize, setCropSize] = useState({ w: 45, h: 30 });
  const [blinkThreshold, setBlinkThreshold] = useState(130);
  const [showTuning, setShowTuning] = useState(true);
  const [autoTrack, setAutoTrack] = useState(true);

  // Sync state values to refs for the high-frequency animation loop
  const leftEyeCenterRef = useRef(leftEyeCenter);
  const rightEyeCenterRef = useRef(rightEyeCenter);
  const cropSizeRef = useRef(cropSize);
  const blinkThresholdRef = useRef(blinkThreshold);
  const autoTrackRef = useRef(autoTrack);

  // High-frequency frame ticker and tracking smoothing refs
  const frameCountRef = useRef(0);
  const trackedLeftXRef = useRef(115);
  const trackedRightXRef = useRef(202);
  const trackedYRef = useRef(95);
  const activeSessionIdRef = useRef(0);

  useEffect(() => {
    leftEyeCenterRef.current = leftEyeCenter;
  }, [leftEyeCenter]);

  useEffect(() => {
    rightEyeCenterRef.current = rightEyeCenter;
  }, [rightEyeCenter]);

  useEffect(() => {
    cropSizeRef.current = cropSize;
  }, [cropSize]);

  useEffect(() => {
    blinkThresholdRef.current = blinkThreshold;
    const ev = new CustomEvent('gazeui-blink-threshold-changed', {
      detail: { threshold: blinkThreshold },
    });
    window.dispatchEvent(ev);
  }, [blinkThreshold]);

  useEffect(() => {
    const handleSetThreshold = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && typeof customEvent.detail.threshold === 'number') {
        setBlinkThreshold(customEvent.detail.threshold);
      }
    };
    window.addEventListener('gazeui-set-blink-threshold', handleSetThreshold);
    return () => {
      window.removeEventListener('gazeui-set-blink-threshold', handleSetThreshold);
    };
  }, []);

  useEffect(() => {
    autoTrackRef.current = autoTrack;
  }, [autoTrack]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !isCameraModelReady) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    // Convert click position to the internal 320x240 webcam logic coordinates
    const scaleX = 320 / rect.width;
    const scaleY = 240 / rect.height;
    
    let canvasX = clickX * scaleX;
    const canvasY = clickY * scaleY;
    
    // Canvas is horizontally flipped with scale-x-[-1] for a mirror effect.
    // Invert the clicked X coordinate to match the unmirrored source frame coordinate system.
    canvasX = 320 - canvasX;
    
    // Split the frame logic between the unmirrored left-half eye box and right-half eye box.
    if (canvasX < 160) {
      const newX = Math.round(Math.max(20, Math.min(150, canvasX)));
      const newY = Math.round(Math.max(20, Math.min(200, canvasY)));
      setLeftEyeCenter({ x: newX, y: newY });
      trackedLeftXRef.current = newX;
      trackedYRef.current = newY;
      setDiagnosticText('Aligned Left Eye socket! Stopped auto-track drift.');
    } else {
      const newX = Math.round(Math.max(170, Math.min(300, canvasX)));
      const newY = Math.round(Math.max(20, Math.min(200, canvasY)));
      setRightEyeCenter({ x: newX, y: newY });
      trackedRightXRef.current = newX;
      trackedYRef.current = newY;
      setDiagnosticText('Aligned Right Eye socket! Stopped auto-track drift.');
    }
  };

  useEffect(() => {
    if (isActive) {
      startCamera();
      frameCountRef.current = 0;
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isActive]);

  const startCamera = async () => {
    setErrorMsg(null);
    const sessionId = ++activeSessionIdRef.current;
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      // If the tracking state has been turned off or re-triggered during media request, abort immediately.
      if (sessionId !== activeSessionIdRef.current || !isActive) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play()
          .then(() => {
            if (sessionId === activeSessionIdRef.current) {
              setIsCameraModelReady(true);
            }
          })
          .catch((err) => {
            console.warn('Silent fallback for minor play() interruptions inside preview frame stream:', err);
          });
      }
    } catch (err: any) {
      if (sessionId === activeSessionIdRef.current) {
        console.error('Error accessing webcam', err);
        setErrorMsg(
          'Webcam access blocked or unavailable. Falling back to the Gaze Simulation Model.'
        );
        setIsCameraModelReady(false);
      }
    }
  };

  const stopCamera = () => {
    activeSessionIdRef.current++; // Invalidate active capture streams in-flight
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsCameraModelReady(false);
  };

  useEffect(() => {
    let animationId: number;

    const processFrame = () => {
      if (!isCameraModelReady || !videoRef.current || !canvasRef.current || !isActive) {
        animationId = requestAnimationFrame(processFrame);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx || video.paused || video.ended) {
        animationId = requestAnimationFrame(processFrame);
        return;
      }

      // Draw standard raw webcam onto canvas so we can search the true frame pixels
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Perform real-time Pupil Tracking Centroid search on the cropped channels
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      const getPixelGrayscale = (x: number, y: number) => {
        const idx = (y * canvas.width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        return 0.299 * r + 0.587 * g + 0.114 * b;
      };

      const leftEyeCenterVal = leftEyeCenterRef.current;
      const rightEyeCenterVal = rightEyeCenterRef.current;
      const cropSizeVal = cropSizeRef.current;

      frameCountRef.current++;

      let activeLeftX = leftEyeCenterVal.x;
      let activeRightX = rightEyeCenterVal.x;
      let activeY = (leftEyeCenterVal.y + rightEyeCenterVal.y) / 2;

      // Real-time eye socket tracking to cancel head/face motion!
      if (autoTrackRef.current) {
        const rowSums = new Array(240).fill(0);
        const colSums = new Array(320).fill(0);

        // Grid-scan bounded facial region to keep overhead under 1ms
        const startX = 50;
        const endX = 270;
        const startY = 45;
        const endY = 165;

        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const gray = getPixelGrayscale(x, y);
            rowSums[y] += gray;
            colSums[x] += gray;
          }
        }

        // 1. Locate Eye horizon line (darkest horizontal valley belt)
        let foundY = 95;
        let minYVal = Infinity;
        for (let y = startY + 5; y < endY - 5; y++) {
          let windowSum = 0;
          for (let dy = -2; dy <= 2; dy++) {
            windowSum += rowSums[y + dy];
          }
          if (windowSum < minYVal) {
            minYVal = windowSum;
            foundY = y;
          }
        }

        // 2. Locate Left Eye column basin (x: 60 to 145)
        let foundLeftX = 115;
        let minLeftVal = Infinity;
        for (let x = 60; x < 145; x++) {
          let windowSum = 0;
          for (let dx = -3; dx <= 3; dx++) {
            windowSum += colSums[x + dx];
          }
          if (windowSum < minLeftVal) {
            minLeftVal = windowSum;
            foundLeftX = x;
          }
        }

        // 3. Locate Right Eye column basin (x: 175 to 260)
        let foundRightX = 202;
        let minRightVal = Infinity;
        for (let x = 175; x < 260; x++) {
          let windowSum = 0;
          for (let dx = -3; dx <= 3; dx++) {
            windowSum += colSums[x + dx];
          }
          if (windowSum < minRightVal) {
            minRightVal = windowSum;
            foundRightX = x;
          }
        }

        // Apply faster lock on startup/reset (snap to face coordinate), then low-pass smoothing
        const isInitializing = frameCountRef.current < 25;
        const tAlpha = isInitializing ? 1.0 : 0.08;

        trackedLeftXRef.current += (foundLeftX - trackedLeftXRef.current) * tAlpha;
        trackedRightXRef.current += (foundRightX - trackedRightXRef.current) * tAlpha;
        trackedYRef.current += (foundY - trackedYRef.current) * tAlpha;

        // Clip parameters to safe ranges
        trackedLeftXRef.current = Math.max(40, Math.min(150, trackedLeftXRef.current));
        trackedRightXRef.current = Math.max(170, Math.min(280, trackedRightXRef.current));
        trackedYRef.current = Math.max(40, Math.min(180, trackedYRef.current));

        activeLeftX = Math.round(trackedLeftXRef.current);
        activeRightX = Math.round(trackedRightXRef.current);
        activeY = Math.round(trackedYRef.current);

        // Update the visual calibration sliders in background periodically 
        if (isInitializing || frameCountRef.current % 6 === 0) {
          setLeftEyeCenter({ x: activeLeftX, y: activeY });
          setRightEyeCenter({ x: activeRightX, y: activeY });
        }
      }

      const eyeLeftCrop = {
        x: Math.max(0, Math.min(320 - cropSizeVal.w, activeLeftX - Math.round(cropSizeVal.w / 2))),
        y: Math.max(0, Math.min(240 - cropSizeVal.h, activeY - Math.round(cropSizeVal.h / 2))),
        w: cropSizeVal.w,
        h: cropSizeVal.h,
      };

      const eyeRightCrop = {
        x: Math.max(0, Math.min(320 - cropSizeVal.w, activeRightX - Math.round(cropSizeVal.w / 2))),
        y: Math.max(0, Math.min(240 - cropSizeVal.h, activeY - Math.round(cropSizeVal.h / 2))),
        w: cropSizeVal.w,
        h: cropSizeVal.h,
      };

      // Helper to find pupil centroid in eye boxes
      const locatePupil = (crop: { x: number; y: number; w: number; h: number }) => {
        let minVal = 255;
        let bestX = crop.x + crop.w / 2;
        let bestY = crop.y + crop.h / 2;

        let totalWeight = 0;
        let weightedX = 0;
        let weightedY = 0;
        
        let localMin = 255;

        // 1. Scan the crop box for the lowest intensity (pupil is darkest)
        for (let cy = crop.y; cy < crop.y + crop.h; cy++) {
          for (let cx = crop.x; cx < crop.x + crop.w; cx++) {
            const gray = getPixelGrayscale(cx, cy);
            if (gray < localMin) {
              localMin = gray;
            }
          }
        }

        // To make it very robust to glare, find the center of mass of the darkest pixels
        const threshold = localMin + 15; // Darkest cluster threshold
        
        for (let cy = crop.y; cy < crop.y + crop.h; cy++) {
          for (let cx = crop.x; cx < crop.x + crop.w; cx++) {
            const gray = getPixelGrayscale(cx, cy);
            if (gray <= threshold) {
              // Weight closer to 1 for extremely dark, closer to 0 for threshold limit
              const weight = (threshold - gray);
              weightedX += cx * weight;
              weightedY += cy * weight;
              totalWeight += weight;
            }
          }
        }

        if (totalWeight > 0) {
          bestX = weightedX / totalWeight;
          bestY = weightedY / totalWeight;
        }

        return { x: bestX, y: bestY, pupilDarkness: localMin };
      };

      const leftPupil = locatePupil(eyeLeftCrop);
      const rightPupil = locatePupil(eyeRightCrop);

      // Estimate average lighting health
      const frameAvgGrayscale = (leftPupil.pupilDarkness + rightPupil.pupilDarkness) / 2;
      if (frameAvgGrayscale < 30) {
        setLightingHealth('low');
        setDiagnosticText('Slightly low light in pupil box. Add face illumination.');
      } else if (frameAvgGrayscale > 210) {
        setLightingHealth('saturated');
        setDiagnosticText('Overexposed reflection glare detected on pupils.');
      } else {
        setLightingHealth('good');
        setDiagnosticText('Robust tracking: Centroid cross (+) lock engaged');
      }

      // Check deliberate blink: when eyes are shut, 
      // skin is reflecting, and pupil minimum increases drastically.
      const basePupilDarkness = Math.min(leftPupil.pupilDarkness, rightPupil.pupilDarkness);
      const isBlinking = basePupilDarkness > blinkThresholdRef.current; // Dynamic and configurable based on threshold slider!
      const earValue = isBlinking ? 0.05 : 0.35; // Simulate standard EAR values

      // Normalize pupil coordinates relative to their resting crop center to scale gaze vector [-1, 1]
      const leftCenterX = eyeLeftCrop.x + eyeLeftCrop.w / 2;
      const leftCenterY = eyeLeftCrop.y + eyeLeftCrop.h / 2;
      const rightCenterX = eyeRightCrop.x + eyeRightCrop.w / 2;
      const rightCenterY = eyeRightCrop.y + eyeRightCrop.h / 2;

      const normLeftX = (leftPupil.x - leftCenterX) / (eyeLeftCrop.w / 2);
      const normLeftY = (leftPupil.y - leftCenterY) / (eyeLeftCrop.h / 2);
      const normRightX = (rightPupil.x - rightCenterX) / (eyeRightCrop.w / 2);
      const normRightY = (rightPupil.y - rightCenterY) / (eyeRightCrop.h / 2);

      // Average the horizontal and vertical gaze coordinates for symmetry
      const gx = (normLeftX + normRightX) / 2;
      const gy = (normLeftY + normRightY) / 2;

      // Report gaze vectors to top orchestrator
      onGazeUpdate(gx, gy, earValue);

      // ─────────────────────────────────────────────────────────────────
      // ONSCREEN DEBUG OVERLAY RENDERING (Futuristic Lab console overlay)
      // ─────────────────────────────────────────────────────────────────
      ctx.lineWidth = 1.5;

      // Draw Face Frame Box Guide
      ctx.strokeStyle = 'rgba(18, 18, 18, 0.1)';
      ctx.strokeRect(50, 40, canvas.width - 100, canvas.height - 80);

       // Left Eye Zone Crop outline
       const trackingColor = isBlinking ? '#ef4444' : (autoTrackRef.current ? '#10b981' : '#121212');
       ctx.strokeStyle = trackingColor;
       ctx.strokeRect(eyeLeftCrop.x, eyeLeftCrop.y, eyeLeftCrop.w, eyeLeftCrop.h);
       ctx.font = '7px Courier New';
       ctx.fillStyle = trackingColor;
       ctx.fillText(autoTrackRef.current ? 'L-EYE_AUTO' : 'L-EYE_BOX', eyeLeftCrop.x, eyeLeftCrop.y - 3);
 
       // Right Eye Zone Crop outline
       ctx.strokeStyle = trackingColor;
       ctx.strokeRect(eyeRightCrop.x, eyeRightCrop.y, eyeRightCrop.w, eyeRightCrop.h);
       ctx.fillStyle = trackingColor;
       ctx.fillText(autoTrackRef.current ? 'R-EYE_AUTO' : 'R-EYE_BOX', eyeRightCrop.x, eyeRightCrop.y - 3);

      // Nose Reference Guide Line
      ctx.strokeStyle = 'rgba(18, 18, 18, 0.15)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, 40);
      ctx.lineTo(canvas.width / 2, canvas.height - 40);
      ctx.stroke();
      ctx.setLineDash([]);

      if (!isBlinking) {
        // Draw Centroid Tracking Crosshair (+) for left pupil
        ctx.strokeStyle = '#121212'; // Black track cross
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(leftPupil.x - 6, leftPupil.y);
        ctx.lineTo(leftPupil.x + 6, leftPupil.y);
        ctx.moveTo(leftPupil.x, leftPupil.y - 6);
        ctx.lineTo(leftPupil.x, leftPupil.y + 6);
        ctx.stroke();

        // Draw Centroid Tracking Crosshair (+) for right pupil
        ctx.beginPath();
        ctx.moveTo(rightPupil.x - 6, rightPupil.y);
        ctx.lineTo(rightPupil.x + 6, rightPupil.y);
        ctx.moveTo(rightPupil.x, rightPupil.y - 6);
        ctx.lineTo(rightPupil.x, rightPupil.y + 6);
        ctx.stroke();

        // Draw micro vectors directly on overlay
        ctx.strokeStyle = '#888888'; // Grey vector link
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(leftCenterX, leftCenterY);
        ctx.lineTo(leftPupil.x, leftPupil.y);
        ctx.moveTo(rightCenterX, rightCenterY);
        ctx.lineTo(rightPupil.x, rightPupil.y);
        ctx.stroke();
      } else {
        // Closed / Blink block banner
        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.fillRect(eyeLeftCrop.x, eyeLeftCrop.y, eyeLeftCrop.w, eyeLeftCrop.h);
        ctx.fillRect(eyeRightCrop.x, eyeRightCrop.y, eyeRightCrop.w, eyeRightCrop.h);
        ctx.font = 'bold 8px Courier New';
        ctx.fillStyle = '#ef4444';
        ctx.fillText('BLINK', leftCenterX - 10, leftCenterY + 3);
        ctx.fillText('BLINK', rightCenterX - 10, rightCenterY + 3);
      }

      animationId = requestAnimationFrame(processFrame);
    };

    if (isCameraModelReady && isActive) {
      animationId = requestAnimationFrame(processFrame);
    }

    return () => cancelAnimationFrame(animationId);
  }, [isCameraModelReady, isActive]);

  return (
    <div className="flex flex-col gap-3 p-4 bg-white border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-[#121212]">
      <div className="flex items-center justify-between border-b border-black/10 pb-1.5">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-black" />
          <h4 className="text-xs font-mono font-black tracking-wider text-black uppercase">
            WEBCAM REFLECTION (PCCR)
          </h4>
        </div>
        <div className="flex items-center gap-1.5 bg-[#F5F5F3] px-2 py-0.5 border border-black">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isActive && isCameraModelReady 
                ? 'bg-emerald-50 animate-ping bg-emerald-500' 
                : isActive 
                ? 'bg-amber-500 animate-pulse' 
                : 'bg-slate-400'
            }`}
          />
          <span className="text-[9px] font-mono font-black text-black uppercase">
            {isActive && isCameraModelReady 
              ? 'LOCK_ENGAGED' 
              : isActive 
              ? 'INITIALIZING' 
              : 'STANDBY'}
          </span>
        </div>
      </div>

      {errorMsg ? (
        <div className="p-3 bg-red-50 border border-red-600 text-red-600 text-xs flex gap-2 font-mono uppercase font-bold">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{errorMsg}</p>
        </div>
      ) : (
        <div className="relative overflow-hidden bg-white aspect-video max-w-[320px] mx-auto border border-black shadow">
          {/* Real Canvas Overlay Render */}
          <canvas
            ref={canvasRef}
            width={320}
            height={240}
            onClick={handleCanvasClick}
            className={`w-full h-full object-cover scale-x-[-1] ${isActive && isCameraModelReady ? 'cursor-crosshair animate-pulse border-black/10' : ''}`} // mirror webcam
            title="Click to align eye boxes"
          />

          {/* Hidden reference video */}
          <video
            ref={videoRef}
            aria-hidden="true"
            className="hidden"
            playsInline
            muted
          />

          {!isActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/95 text-black gap-1.5 text-xs font-mono">
              <EyeOff className="w-8 h-8 text-black" />
              <p className="font-extrabold tracking-widest uppercase text-[10px]">WEBCAM TRACKING INACTIVE</p>
            </div>
          )}

          {isActive && !isCameraModelReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white text-black gap-1.5 text-xs font-mono">
              <RefreshCw className="w-5 h-5 animate-spin text-black" />
              <p className="font-extrabold tracking-widest uppercase">INITIALIZING CAMERA CAPTURE...</p>
            </div>
          )}

          {/* Box guides shown over camera */}
          {isActive && isCameraModelReady && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-white px-2 py-0.5 border border-black pointer-events-none text-[8px] font-mono font-bold uppercase text-black">
              <Eye className="w-3 h-3 text-black" />
              <span>ALIGN PUPILS IN REGIONS</span>
            </div>
          )}
        </div>
      )}

      {/* Diagnostics Readout bar */}
      {isActive && isCameraModelReady && (
        <div className="grid grid-cols-1 gap-1 bg-[#F5F5F3] p-2 border border-black text-[9px] font-mono font-bold uppercase text-black">
          <div className="flex justify-between items-center text-slate-500 border-b border-black/10 pb-1 mb-1">
            <span>HEALTH STATE</span>
            <div className="flex items-center gap-1">
              {lightingHealth === 'good' ? (
                <CheckCircle className="w-3 h-3 text-black" />
              ) : (
                <Info className="w-3 h-3 text-red-600" />
              )}
              <span
                className={
                  lightingHealth === 'good'
                    ? 'text-black font-black'
                    : lightingHealth === 'low'
                    ? 'text-red-600 font-black'
                    : 'text-red-600 font-black'
                }
              >
                {lightingHealth.toUpperCase()}
              </span>
            </div>
          </div>
          <p className="text-black font-semibold leading-tight">
            {diagnosticText}
          </p>
        </div>
      )}

      {/* Dynamic Eye Box Tuning & Blink Sensitivity Adjustment Dashboard */}
      {isActive && isCameraModelReady && (
        <div className="flex flex-col gap-2 border border-black p-3 bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-[#121212]">
          <button
            type="button"
            onClick={() => setShowTuning(!showTuning)}
            className="flex items-center justify-between text-xs font-mono font-black tracking-wider text-black uppercase hover:bg-[#F5F5F3] p-1 border border-transparent transition-all"
          >
            <span>🔧 CAMERA CALIBRATION & SLIDERS</span>
            <span className="font-extrabold">{showTuning ? '[-] HIDE' : '[+] SHOW'}</span>
          </button>

          {showTuning && (
            <div className="flex flex-col gap-3 pt-2 border-t border-black/10 text-[10px] font-mono select-none">
              <div className="bg-yellow-50 text-amber-900 border border-amber-300 p-2 leading-normal uppercase text-[9px] font-bold">
                💡 TIP: Click directly on your Left Eye and Right Eye in the camera preview overlay above to quickly snap the tracking boxes to your face!
              </div>

              {/* Real-time Anatomical Head-motion Compensation Orbit Lock */}
              <div className="flex items-center justify-between p-2.5 bg-black text-white border border-black font-mono">
                <div className="flex flex-col gap-0.5 max-w-[70%]">
                  <span className="font-extrabold text-[10px] tracking-wider uppercase text-emerald-400">🤖 FACE MOVEMENT COMPENSATOR</span>
                  <span className="text-[8px] text-slate-300 uppercase leading-normal">
                    AUTO-ALIGN EYE SOCKETS TO PREVENT HEAD ROTATION FROM ERRONEOUSLY DRIFTING YOUR EYE GAZE CURSOR!
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !autoTrack;
                    setAutoTrack(nextVal);
                    setDiagnosticText(nextVal ? 'Engaged automatic head-motion filters.' : 'Disabled auto-track. Manual adjust active.');
                  }}
                  className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider border transition-all ${
                    autoTrack
                      ? 'bg-emerald-500 text-black border-transparent hover:bg-emerald-400'
                      : 'bg-white text-black border-black hover:bg-slate-100'
                  }`}
                >
                  {autoTrack ? 'LOCK ENGAGED' : 'MANUAL'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1.5 p-2 bg-[#F5F5F3] border border-black/10">
                  <span className="font-black text-black font-sans">LEFT EYE_BOX POS</span>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px]">
                      X [HORIZ]: <span className="font-bold text-black">{leftEyeCenter.x}px</span>
                      <input
                        type="range"
                        min="20"
                        max="150"
                        value={leftEyeCenter.x}
                        onChange={(e) => setLeftEyeCenter((prev) => ({ ...prev, x: parseInt(e.target.value) }))}
                        className="w-full accent-black h-1 bg-slate-200 mt-1 cursor-ew-resize"
                      />
                    </label>
                    <label className="text-[9px]">
                      Y [VERT]: <span className="font-bold text-black">{leftEyeCenter.y}px</span>
                      <input
                        type="range"
                        min="20"
                        max="200"
                        value={leftEyeCenter.y}
                        onChange={(e) => setLeftEyeCenter((prev) => ({ ...prev, y: parseInt(e.target.value) }))}
                        className="w-full accent-black h-1 bg-slate-200 mt-1 cursor-ns-resize"
                      />
                    </label>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 p-2 bg-[#F5F5F3] border border-black/10">
                  <span className="font-black text-black font-sans">RIGHT EYE_BOX POS</span>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px]">
                      X [HORIZ]: <span className="font-bold text-black">{rightEyeCenter.x}px</span>
                      <input
                        type="range"
                        min="170"
                        max="300"
                        value={rightEyeCenter.x}
                        onChange={(e) => setRightEyeCenter((prev) => ({ ...prev, x: parseInt(e.target.value) }))}
                        className="w-full accent-black h-1 bg-slate-200 mt-1 cursor-ew-resize"
                      />
                    </label>
                    <label className="text-[9px]">
                      Y [VERT]: <span className="font-bold text-black">{rightEyeCenter.y}px</span>
                      <input
                        type="range"
                        min="20"
                        max="200"
                        value={rightEyeCenter.y}
                        onChange={(e) => setRightEyeCenter((prev) => ({ ...prev, y: parseInt(e.target.value) }))}
                        className="w-full accent-black h-1 bg-slate-200 mt-1 cursor-ns-resize"
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex flex-col p-2 bg-[#F5F5F3] border border-black/10 gap-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-black text-black">BLINK TRIGGER THRESHOLD</span>
                  <span className="bg-black text-white px-1.5 py-0.5 font-bold">{blinkThreshold}</span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="220"
                  value={blinkThreshold}
                  onChange={(e) => setBlinkThreshold(parseInt(e.target.value))}
                  className="w-full accent-black h-1 bg-slate-200 cursor-ew-resize"
                />
                <p className="text-[8px] text-slate-500 uppercase leading-snug">
                  * IF TRACKER IS STUCK IN "BLINK" STATE, INCREASE THRESHOLD SLIDER (E.G. 150-180). IF BLINKS ARE MISSED, LOWER IT.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  frameCountRef.current = 0;
                  setLeftEyeCenter({ x: 115, y: 95 });
                  setRightEyeCenter({ x: 202, y: 95 });
                  setCropSize({ w: 45, h: 30 });
                  setBlinkThreshold(130);
                  setDiagnosticText('Triggered instant auto-align eye detection search.');
                }}
                className="w-full mt-1 py-1.5 bg-white hover:bg-[#F5F5F3] text-black border border-black text-[9px] font-black tracking-widest uppercase transition-all"
              >
                ♻️ AUTO-DETECT & RE-ALIGN EYE BOXES
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
