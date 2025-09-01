import React, { useRef, useState, useEffect, useCallback } from "react";
import { Camera, ArrowBigLeft , UndoDot, Download , CaseSensitive, Map, MapPinPen} from 'lucide-react'


const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE; 

export default function GarminOverlayApp() {
  const [page, setPage] = useState("upload"); // upload | activities | editor
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [activities, setActivities] = useState([]);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [gpxText, setGpxText] = useState(null);

  const [routeCoords, setRouteCoords] = useState([]);
  const [routeBBox, setRouteBBox] = useState(null); // {minLat,maxLat,minLon,maxLon}
  const [baseRouteBounds, setBaseRouteBounds] = useState(null); // {minX,maxX,minY,maxY}

  // overlay style state
  const [textStyle, setTextStyle] = useState({ size: 48, color: "#ffffff" });
  const [routeStyle, setRouteStyle] = useState({ color: "#ff5100ff", width: 20, alpha: 1, scale: 1, offsetX: 0, offsetY: 0 });

  const [textPos, setTextPos] = useState({ x: 120, y: 60 });

  const [openPanel, setOpenPanel] = useState(null); 

  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const gestureRef = useRef({});

  useEffect(() => {
    if (page === "activities") fetchActivities();
  }, [page]);

  async function fetchActivities() {
    try {
      const res = await fetch(`${BACKEND_BASE}/activities`);
      const data = await res.json();
      setActivities(data);
    } catch (e) {
      console.error(e);
      setActivities([]);
    }
  }

  async function fetchActivityGPX(activityId) {
    try {
      const res = await fetch(`${BACKEND_BASE}/activities/${activityId}/gpx`);
      const text = await res.text();
      return text;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  function onImageSelected(file) {
    if (!file) return;
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    // small delay so UI shows upload
    setTimeout(() => setPage("activities"), 0);
  }

  async function onSelectActivity(act) {
    setSelectedActivity(act);
    const gpx = await fetchActivityGPX(act.activityId);
    setGpxText(gpx);
    setPage("editor");
  }

  function parseGPX(gpx) {
    if (!gpx) return [];
    try {
      const parser = new DOMParser();
      const xml = parser.parseFromString(gpx, "application/xml");
      const trks = Array.from(xml.querySelectorAll("trk trkseg trkpt"));
      const pts = trks.length > 0 ? trks : Array.from(xml.querySelectorAll("rte rtept"));
      return pts.map((pt) => ({ lat: parseFloat(pt.getAttribute("lat")), lon: parseFloat(pt.getAttribute("lon")) }));
    } catch (e) {
      console.error("GPX parse error", e);
      return [];
    }
  }

  // compute bbox and set initial transform for route when both image and coords available
  function computeRouteInitialTransform(coords, imgW, imgH) {
    if (!coords || coords.length === 0 || !imgW || !imgH) return;
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    coords.forEach((c) => {
      if (c.lat < minLat) minLat = c.lat;
      if (c.lat > maxLat) maxLat = c.lat;
      if (c.lon < minLon) minLon = c.lon;
      if (c.lon > maxLon) maxLon = c.lon;
    });
    const pad = 0.02;
    minLat -= pad; maxLat += pad; minLon -= pad; maxLon += pad;

    const latRange = maxLat - minLat || 1;
    const lonRange = maxLon - minLon || 1;

    // map to unscaled pixel coords
    const xs = coords.map(c => ((c.lon - minLon) / lonRange) * imgW);
    const ys = coords.map(c => ((maxLat - c.lat) / latRange) * imgH);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const dx = maxX - minX || imgW;
    const dy = maxY - minY || imgH;

    const scaleX = (imgW * 0.85) / dx;
    const scaleY = (imgH * 0.85) / dy;
    const scale = Math.min(scaleX, scaleY, 1.0);

    const offsetX = (imgW - dx * scale) / 2 - minX * scale;
    const offsetY = (imgH - dy * scale) / 2 - minY * scale;

    setRouteStyle((s) => ({ ...s, scale, offsetX, offsetY }));
    setRouteBBox({ minLat, maxLat, minLon, maxLon });
    setBaseRouteBounds({ minX, maxX, minY, maxY });
  }

  // when gpx or image loads, parse coords and compute initial transform
  useEffect(() => {
    if (!gpxText) {
      setRouteCoords([]);
      setRouteBBox(null);
      return;
    }
    const coords = parseGPX(gpxText);
    setRouteCoords(coords);
    // if image loaded, compute transform
    const img = imgRef.current;
    if (img && img.naturalWidth && coords.length > 0) {
      computeRouteInitialTransform(coords, img.naturalWidth, img.naturalHeight);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpxText]);

  // also when image changes and we already have coords, fit route
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.naturalWidth && routeCoords.length > 0) {
      computeRouteInitialTransform(routeCoords, img.naturalWidth, img.naturalHeight);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  function buildActivityText() {
    if (!selectedActivity) return "";
    const a = selectedActivity;
    return `距离\n${(a.distance/1000).toFixed(2)} km\n爬升海拔\n${a.elevationGain} m\n时间\n${formatDurationShort(a.duration)}`;
  }

  // Reusable drawing function with proper font loading
  async function drawOverlay(ctx, width, height) {
    // Ensure font is loaded before drawing
    if (!document.fonts.check("12px FSDillonPro")) {
      const font = new FontFace(
        "FSDillonPro",
        "url(/src/assets/fonts/FSDillonProMedium.woff2)"
      );
      try {
        await font.load();
        document.fonts.add(font);
      } catch (e) {
        console.error("Font load error:", e);
      }
    }

    const img = imgRef.current;
    if (!img) return;

    // clear and draw image
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    // draw route
    if (routeCoords && routeCoords.length > 0 && routeBBox) {
      const { minLat, maxLat, minLon, maxLon } = routeBBox;
      const latRange = maxLat - minLat || 1;
      const lonRange = maxLon - minLon || 1;

      ctx.save();
      ctx.globalAlpha = routeStyle.alpha;
      ctx.lineWidth = Math.max(1, routeStyle.width);
      ctx.strokeStyle = routeStyle.color;
      ctx.beginPath();
      routeCoords.forEach((c, i) => {
        const baseX = ((c.lon - minLon) / lonRange) * width;
        const baseY = ((maxLat - c.lat) / latRange) * height;
        const x = baseX * routeStyle.scale + routeStyle.offsetX;
        const y = baseY * routeStyle.scale + routeStyle.offsetY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    }

    // draw text
    ctx.save();
    ctx.fillStyle = textStyle.color;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    const lines = buildActivityText().split("\n").filter(Boolean);
    let y = textPos.y;
    lines.forEach((line, index) => {
      const isSmallText = index % 2 === 0;
      const fontSize = isSmallText ? textStyle.size * 0.45 : textStyle.size;
      
      ctx.font = `${fontSize}px 'FSDillonPro', system-ui, -apple-system, BlinkMacSystemFont, Roboto, Arial`;
      
      const centerX = textPos.x;
      
      ctx.save();
      if (isSmallText) {
        ctx.globalAlpha = 0.8;
        ctx.fillText(line, centerX, y);
        y += fontSize * 1.3;
      } else {
        ctx.translate(centerX, y);
        ctx.scale(1.4, 1); 
        ctx.translate(-centerX, -y);
        ctx.fillText(line, centerX, y);
        y += fontSize * 2;
      }
      ctx.restore();
    });
    ctx.restore();
  }

  async function drawCanvas() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.complete) return;
    const ctx = canvas.getContext("2d");

    // keep canvas internal size at natural image pixels, scale via CSS
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    await drawOverlay(ctx, canvas.width, canvas.height);
  }

  useEffect(() => {
    if (page === "editor") drawCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, routeCoords, routeStyle, textStyle, textPos, routeBBox, selectedActivity]);

  function onImgLoad() {
    // when image finishes loading, if we have coords fit them
    const img = imgRef.current;
    if (img && routeCoords && routeCoords.length > 0) {
      computeRouteInitialTransform(routeCoords, img.naturalWidth, img.naturalHeight);
    }
    drawCanvas();
  }

  // helper: convert client coords (mouse/touch) to canvas internal coords
  function clientToCanvas(clientX, clientY) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  }

  function onPointerDown(e) {
    e.preventDefault();
    const isTouch = e.type.startsWith('touch');
    if (isTouch) {
      const t = e.touches;
      if (t.length === 2) {
        // start pinch
        const p1 = clientToCanvas(t[0].clientX, t[0].clientY);
        const p2 = clientToCanvas(t[1].clientX, t[1].clientY);
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);
        const focal = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        gestureRef.current = {
          type: 'pinch',
          initialDist: dist,
          initialScale: routeStyle.scale,
          initialOffsetX: routeStyle.offsetX,
          initialOffsetY: routeStyle.offsetY,
          focal
        };
        return;
      }
      // single touch -> decide drag text or route
      const p = clientToCanvas(t[0].clientX, t[0].clientY);
      const textWidth = 420;
      const textHalfWidth = textWidth / 2;
      const textHeight = textStyle.size * 4;
      const textBox = { x: textPos.x - textHalfWidth, y: textPos.y, w: textWidth, h: textHeight };
      if (p.x >= textBox.x && p.x <= textBox.x + textBox.w && p.y >= textBox.y && p.y <= textBox.y + textBox.h) {
        gestureRef.current = { type: 'drag_text', last: p };
      } else {
        gestureRef.current = { type: 'drag_route', last: p };
      }
    } else {
      // mouse event
      const p = clientToCanvas(e.clientX, e.clientY);
      const textWidth = 420;
      const textHalfWidth = textWidth / 2;
      const textHeight = textStyle.size * 4;
      const textBox = { x: textPos.x - textHalfWidth, y: textPos.y, w: textWidth, h: textHeight };
      if (p.x >= textBox.x && p.x <= textBox.x + textBox.w && p.y >= textBox.y && p.y <= textBox.y + textBox.h) {
        gestureRef.current = { type: 'drag_text', last: p };
      } else {
        gestureRef.current = { type: 'drag_route', last: p };
      }

      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('mouseup', onPointerUp);
    }
  }

  function onPointerMove(e) {
    const isTouch = e.type.startsWith('touch');
    if (isTouch) {
      const t = e.touches;
      if (!gestureRef.current || !gestureRef.current.type) return;
      if (gestureRef.current.type === 'pinch' && t.length === 2) {
        const p1 = clientToCanvas(t[0].clientX, t[0].clientY);
        const p2 = clientToCanvas(t[1].clientX, t[1].clientY);
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);
        const r = dist / gestureRef.current.initialDist;
        const newScale = Math.max(0.05, Math.min(20, gestureRef.current.initialScale * r));
        const ratio = newScale / gestureRef.current.initialScale;
        const focal = gestureRef.current.focal;
        const newOffsetX = gestureRef.current.initialOffsetX + focal.x * (1 - ratio);
        const newOffsetY = gestureRef.current.initialOffsetY + focal.y * (1 - ratio);
        setRouteStyle((s) => {
          let clampedX = newOffsetX;
          let clampedY = newOffsetY;
          if (baseRouteBounds && canvasRef.current) {
            const sc = newScale;
            const minOffX = - (baseRouteBounds.minX * sc);
            const maxOffX = canvasRef.current.width - (baseRouteBounds.maxX * sc);
            clampedX = Math.max(minOffX, Math.min(clampedX, maxOffX));
            const minOffY = - (baseRouteBounds.minY * sc);
            const maxOffY = canvasRef.current.height - (baseRouteBounds.maxY * sc);
            clampedY = Math.max(minOffY, Math.min(clampedY, maxOffY));
          }
          return { ...s, scale: newScale, offsetX: clampedX, offsetY: clampedY };
        });
        return;
      }
      const p = clientToCanvas(t[0].clientX, t[0].clientY);
      const g = gestureRef.current;
      if (!g) return;
      const dx = p.x - g.last.x;
      const dy = p.y - g.last.y;
      if (g.type === 'drag_text') {
        setTextPos((tpos) => {
          let newX = tpos.x + dx;
          let newY = tpos.y + dy;
          const canvas = canvasRef.current;
          if (canvas) {
            const textWidth = 420;
            const halfW = textWidth / 2;
            const h = textStyle.size * 4;
            newX = Math.max(halfW, Math.min(newX, canvas.width - halfW));
            newY = Math.max(0, Math.min(newY, canvas.height - h));
          }
          return { x: newX, y: newY };
        });
      } else if (g.type === 'drag_route') {
        setRouteStyle((rs) => {
          let newOffsetX = rs.offsetX + dx;
          let newOffsetY = rs.offsetY + dy;
          if (baseRouteBounds && canvasRef.current) {
            const sc = rs.scale;
            const minOffX = - (baseRouteBounds.minX * sc);
            const maxOffX = canvasRef.current.width - (baseRouteBounds.maxX * sc);
            newOffsetX = Math.max(minOffX, Math.min(newOffsetX, maxOffX));
            const minOffY = - (baseRouteBounds.minY * sc);
            const maxOffY = canvasRef.current.height - (baseRouteBounds.maxY * sc);
            newOffsetY = Math.max(minOffY, Math.min(newOffsetY, maxOffY));
          }
          return { ...rs, offsetX: newOffsetX, offsetY: newOffsetY };
        });
      }
      gestureRef.current.last = p;
    } else {
      // mouse move (only if dragging)
      if (!gestureRef.current || !gestureRef.current.type) return;
      const p = clientToCanvas(e.clientX, e.clientY);
      const g = gestureRef.current;
      const dx = p.x - g.last.x;
      const dy = p.y - g.last.y;
      if (g.type === 'drag_text') {
        setTextPos((tpos) => {
          let newX = tpos.x + dx;
          let newY = tpos.y + dy;
          const canvas = canvasRef.current;
          if (canvas) {
            const textWidth = 420;
            const halfW = textWidth / 2;
            const h = textStyle.size * 4;
            newX = Math.max(halfW, Math.min(newX, canvas.width - halfW));
            newY = Math.max(0, Math.min(newY, canvas.height - h));
          }
          return { x: newX, y: newY };
        });
      } else if (g.type === 'drag_route') {
        setRouteStyle((rs) => {
          let newOffsetX = rs.offsetX + dx;
          let newOffsetY = rs.offsetY + dy;
          if (baseRouteBounds && canvasRef.current) {
            const sc = rs.scale;
            const minOffX = - (baseRouteBounds.minX * sc);
            const maxOffX = canvasRef.current.width - (baseRouteBounds.maxX * sc);
            newOffsetX = Math.max(minOffX, Math.min(newOffsetX, maxOffX));
            const minOffY = - (baseRouteBounds.minY * sc);
            const maxOffY = canvasRef.current.height - (baseRouteBounds.maxY * sc);
            newOffsetY = Math.max(minOffY, Math.min(newOffsetY, maxOffY));
          }
          return { ...rs, offsetX: newOffsetX, offsetY: newOffsetY };
        });
      }
      gestureRef.current.last = p;
    }
  }

  function onPointerUp(e) {
    gestureRef.current = {};
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
  }

  function onWheel(e) {
    // wheel to scale route (desktop)
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
    const my = (e.clientY - rect.top) * (canvasRef.current.height / rect.height);
    const delta = e.deltaY < 0 ? 1.08 : 0.92;
    setRouteStyle((s) => {
      const newScale = Math.max(0.05, Math.min(20, s.scale * delta));
      const r = newScale / s.scale;
      const newOffsetX = s.offsetX + mx * (1 - r);
      const newOffsetY = s.offsetY + my * (1 - r);
      let clampedX = newOffsetX;
      let clampedY = newOffsetY;
      if (baseRouteBounds && canvasRef.current) {
        const sc = newScale;
        const minOffX = - (baseRouteBounds.minX * sc);
        const maxOffX = canvasRef.current.width - (baseRouteBounds.maxX * sc);
        clampedX = Math.max(minOffX, Math.min(clampedX, maxOffX));
        const minOffY = - (baseRouteBounds.minY * sc);
        const maxOffY = canvasRef.current.height - (baseRouteBounds.maxY * sc);
        clampedY = Math.max(minOffY, Math.min(clampedY, maxOffY));
      }
      return { ...s, scale: newScale, offsetX: clampedX, offsetY: clampedY };
    });
  }

  async function exportImage(asJpeg = false) {
    const img = imgRef.current;
    if (!img) return;
    const off = document.createElement("canvas");
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const ctx = off.getContext("2d");

    // Use the new reusable drawing function
    await drawOverlay(ctx, off.width, off.height);

    const mime = asJpeg ? "image/jpeg" : "image/png";
    off.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `garmin-overlay.${asJpeg ? "jpg" : "png"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, mime, 0.95);
  }

  function resetTransforms() {
    setRouteStyle((s) => ({ ...s, scale: 1, offsetX: 0, offsetY: 0 }));
    setTextPos({ x: 120, y: 60 });
  }

  function UploadPage({ onImageSelected }) {
    const [uploadState, setUploadState] = useState('idle'); // idle, loading, success
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileSelect = useCallback((file) => {
      if (!file || !file.type.startsWith('image/')) return;

      setUploadState('loading');
      
      // 模拟上传过程
      setTimeout(() => {
        setUploadState('success');
        onImageSelected(file);
        
        // 重置状态
        setTimeout(() => {
          setUploadState('idle');
        }, 1000);
      }, 500);
    }, [onImageSelected]);

    const handleInputChange = (e) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    };

    const handleClick = () => {
      fileInputRef.current?.click();
    };


    return (
      <div className={`upload-container ${uploadState}`}>
        <div className="upload-content">
          <h1 className="brand-title">GARMIN</h1>
          <p className="upload-subtitle">Beat Yesterday</p>
          
          <div
            className={`upload-area ${isDragOver ? 'drag-over' : ''}`}
            onClick={handleClick}
            role="button"
            tabIndex={0}
            aria-label="Upload image"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick();
              }
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleInputChange}
              disabled={uploadState !== 'idle'}
            />
            
            <div className="upload-circle">
              <Camera size={60} className="camera-icon" />
            </div>
            
          </div>
        </div>
      </div>
    );
  }

  const handleButtonClick = (panelName) => {
      if (openPanel === panelName) {
          setOpenPanel(null);
          return;
      }
      if (openPanel !== null) {
          setOpenPanel(null);
          setTimeout(() => {
              setOpenPanel(panelName);
          }, 100); 
      } else {
          setOpenPanel(panelName);
      }
  };

  return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-slate-800 via-slate-700 to-indigo-700 text-white flex items-start justify-center p-4 pt-6">
      <div className="w-full max-w-xl mx-auto">
        {page === "upload" && (
           <UploadPage onImageSelected={onImageSelected} />
        )}

        {page === "activities" && (
          <div className="ios-activities-modal">
            <div className="ios-modal-header">
              <h2 className="ios-modal-title">选择活动</h2>
              <button className="ios-cancel-button" onClick={() => setPage("upload")}>
                取消
              </button>
            </div>
            <div className="ios-activities-list">
              {activities.length === 0 && (
                <div className="ios-empty-state">
                  <div className="ios-empty-icon">🛌</div>
                  <div className="ios-empty-text">正在加载或暂无活动</div>
                </div>
              )}
              {activities.map((a) => (
                <div 
                  key={a.activityId} 
                  className="ios-activity-item" 
                  onClick={() => onSelectActivity(a)}
                >
                  <div className="ios-activity-content">
                    <div className="ios-activity-main">
                      <div className="ios-activity-name">{getActivityIcon(a.activityType)} {a.activityName}</div>
                      <div className="ios-activity-time">{a.startTimeLocal}</div>
                    </div>
                    <div className="ios-activity-stats">
                      <div className="ios-activity-distance">
                        📍 {(a.distance/1000).toFixed(2)} km
                      </div>
                      <div className="flex ios-activity-duration">
                        ⏱️ {formatDurationShort(a.duration)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {page === "editor" && (
          <div className="bg-white/5 rounded-2xl p-2 shadow-lg">
            <div className="flex items-center justify-between p-2">
              <button
                className="w-10 h-10 flex items-center justify-center rounded-full"
                onClick={() => setPage("activities")}
              >
                <ArrowBigLeft />
              </button>

              <div className="flex gap-3">
                <button
                  className="w-10 h-10 flex items-center justify-center rounded-full"
                  onClick={() => resetTransforms()}
                >
                  <UndoDot />
                </button>
                <button
                  className="w-10 h-10 flex items-center justify-center rounded-full"
                  onClick={() => exportImage(true)}
                >
                  <Download />
                </button>
              </div>
            </div>

            <div className="relative border rounded-md overflow-hidden bg-slate-900">
              {imageUrl && (
                <canvas
                  ref={canvasRef}
                  className="w-full touch-none"
                  onMouseDown={onPointerDown}
                  onWheel={onWheel}
                  onTouchStart={onPointerDown}
                  onTouchMove={onPointerMove}
                  onTouchEnd={onPointerUp}
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              )}
              {/* hidden image used for natural size and drawing */}
              <img ref={imgRef} src={imageUrl} alt="uploaded" onLoad={onImgLoad} style={{ display: "none" }} />
            </div>

            {/* Bottom fixed toolbar - 4 buttons, each opens a sliding panel */}
            <div className="fixed bottom-4 left-0 right-0 flex justify-center pointer-events-none">
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-3 flex gap-4 pointer-events-auto">
                <button className="px-4 py-2 rounded-xl backdrop-blur-md bg-white/20 text-black font-medium shadow-md active:scale-95 transition duration-200" onClick={() => handleButtonClick('text')}><CaseSensitive /></button>
                <button className="px-4 py-2 rounded-xl backdrop-blur-md bg-white/20 text-black font-medium shadow-md active:scale-95 transition duration-200" onClick={() => handleButtonClick('route')}><Map /></button>
                <button className="px-4 py-2 rounded-xl backdrop-blur-md bg-white/20 text-black font-medium shadow-md active:scale-95 transition duration-200" onClick={() => handleButtonClick('route2')}><MapPinPen /></button>
              </div>
            </div>

            {/* Sliding panels */}
            <div className={`fixed left-4 right-4 bottom-20 rounded-xl bg-white/6 backdrop-blur-xl p-4 transition-transform easy-in-out duration-300 ${openPanel !== null ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 pointer-events-none'}`}>
              {openPanel === 'text' && (
                <div className="flex items-center gap-4 mt-3">
                  {/* 颜色选择器 */}
                  <div className="flex flex-col items-center">
                    <input
                      type="color"
                      value={textStyle.color}
                      onChange={(e) =>
                        setTextStyle((s) => ({ ...s, color: e.target.value }))
                      }
                    />
                  </div>

                  <div className="ml-4 text-sm">大小</div>
                  {/* 大小滑块 */}
                  <div className="flex flex-col items-center flex-1 w-full">
                    <input
                      type="range"
                      min={48}
                      max={200}
                      value={textStyle.size}
                      onChange={(e) =>
                        setTextStyle((s) => ({ ...s, size: Number(e.target.value) }))
                      }
                      className="w-full accent-blue-500 ios-slider"
                    />
                  </div>
                </div>
              )}

              {openPanel === 'route' && (
                
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex flex-col items-center">
                    <input type="color" value={routeStyle.color} onChange={(e)=>setRouteStyle((s)=>({...s, color:e.target.value}))} />
                  </div>
                  <div className="ml-4 text-sm">缩放</div>
                  {/* 路线缩放 */}
                  <div className="flex flex-col items-center flex-1 w-full">
                    <input
                      type="range"
                      min={0.1}
                      max={2}
                      step={0.05}
                      value={routeStyle.scale}
                      onChange={(e) =>
                        setRouteStyle((s) => {
                          const newScale = Number(e.target.value);
                          let newOffsetX = s.offsetX;
                          let newOffsetY = s.offsetY;
                          if (baseRouteBounds && canvasRef.current) {
                            const sc = newScale;
                            const minOffX = - (baseRouteBounds.minX * sc);
                            const maxOffX = canvasRef.current.width - (baseRouteBounds.maxX * sc);
                            newOffsetX = Math.max(minOffX, Math.min(s.offsetX, maxOffX));
                            const minOffY = - (baseRouteBounds.minY * sc);
                            const maxOffY = canvasRef.current.height - (baseRouteBounds.maxY * sc);
                            newOffsetY = Math.max(minOffY, Math.min(s.offsetY, maxOffY));
                          }
                          return { ...s, scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY };
                        })
                      }
                      className="w-full accent-blue-500 ios-slider"
                    />
                  </div>
                </div>
                
              )}

              {openPanel === 'route2' && (
                <div className="space-y-4 w-full">
                  {/* 路线宽度 */}
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-16 text-sm text-gray-200">宽度</div>
                    <input
                      type="range"
                      min={10}
                      max={40}
                      value={routeStyle.width}
                      onChange={(e) =>
                        setRouteStyle((s) => ({ ...s, width: Number(e.target.value) }))
                      }
                      className="flex-1 ios-slider"
                    />
                    <div className="w-16 text-sm text-right text-white">
                      {routeStyle.width}
                    </div>
                  </div>

                  {/* 透明度 */}
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-16 text-sm text-gray-200">透明度</div>
                    <input type="range" min={0.1} max={1} step={0.05} value={routeStyle.alpha} onChange={(e)=>setRouteStyle((s)=>({...s, alpha: Number(e.target.value)}))} className="flex-1 ios-slider" />
                    <div className="w-16 text-sm text-right text-white">
                      {routeStyle.alpha.toFixed(2)}
                    </div>
                  </div>
                
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

function formatDurationShort(s) {
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getActivityIcon(type) {
  switch (type) {
    case 'cycling':
      return '🚴';
    case 'running':
      return '🏃';
    case 'hiking':
      return '🥾';
    default:
      return '🏃';
  }
};