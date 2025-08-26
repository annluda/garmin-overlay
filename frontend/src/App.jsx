import React, { useRef, useState, useEffect } from "react";

const BACKEND_BASE = "http://172.20.10.2:9245"; // replace with your server

export default function GarminOverlayApp() {
  const [page, setPage] = useState("upload"); // upload | activities | editor
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [activities, setActivities] = useState([]);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [gpxText, setGpxText] = useState(null);

  const [routeCoords, setRouteCoords] = useState([]);
  const [routeBBox, setRouteBBox] = useState(null); // {minLat,maxLat,minLon,maxLon}

  // overlay style state
  const [textStyle, setTextStyle] = useState({ size: 20, color: "#ffffff" });
  const [routeStyle, setRouteStyle] = useState({ color: "#00FFAA", width: 3, alpha: 0.9, scale: 1, offsetX: 0, offsetY: 0 });

  const [textPos, setTextPos] = useState({ x: 30, y: 60 });

  const [openPanel, setOpenPanel] = useState(null); // 'text' | 'route' | 'export' | null

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
    setTimeout(() => setPage("activities"), 300);
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
    function fmtDist(m) {
      if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
      return `${Math.round(m)} m`;
    }
    function fmtDur(s) {
      const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const ss = s % 60;
      return `${h}h ${m}m ${ss}s`;
    }
    return `${a.activityName}\n${a.startTimeLocal}\n距: ${fmtDist(a.distance)}  爬升: ${a.elevationGain}m\n时长: ${fmtDur(a.duration)}  卡路里: ${a.calories}`;
  }

  function drawCanvas() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.complete) return;
    const ctx = canvas.getContext("2d");

    // keep canvas internal size at natural image pixels, scale via CSS
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // clear and draw image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

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
        const baseX = ((c.lon - minLon) / lonRange) * canvas.width;
        const baseY = ((maxLat - c.lat) / latRange) * canvas.height;
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
    ctx.font = `${textStyle.size}px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial`;
    ctx.fillStyle = textStyle.color;
    ctx.textBaseline = "top";
    const lines = buildActivityText().split("\n").filter(Boolean);
    let y = textPos.y;
    lines.forEach((line) => {
      ctx.fillText(line, textPos.x, y);
      y += textStyle.size * 1.3;
    });
    ctx.restore();
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
      const textBox = { x: textPos.x, y: textPos.y, w: 420, h: textStyle.size * 4 };
      if (p.x >= textBox.x && p.x <= textBox.x + textBox.w && p.y >= textBox.y && p.y <= textBox.y + textBox.h) {
        gestureRef.current = { type: 'drag_text', last: p };
      } else {
        gestureRef.current = { type: 'drag_route', last: p };
      }
    } else {
      // mouse event
      const p = clientToCanvas(e.clientX, e.clientY);
      const textBox = { x: textPos.x, y: textPos.y, w: 420, h: textStyle.size * 4 };
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
        const focal = gestureRef.current.focal;
        const ratio = newScale / gestureRef.current.initialScale;
        const newOffsetX = gestureRef.current.initialOffsetX + focal.x * (1 - ratio);
        const newOffsetY = gestureRef.current.initialOffsetY + focal.y * (1 - ratio);
        setRouteStyle((s) => ({ ...s, scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY }));
        return;
      }
      const p = clientToCanvas(t[0].clientX, t[0].clientY);
      const g = gestureRef.current;
      if (!g) return;
      const dx = p.x - g.last.x;
      const dy = p.y - g.last.y;
      if (g.type === 'drag_text') {
        setTextPos((tpos) => ({ x: Math.max(0, tpos.x + dx), y: Math.max(0, tpos.y + dy) }));
      } else if (g.type === 'drag_route') {
        setRouteStyle((rs) => ({ ...rs, offsetX: rs.offsetX + dx, offsetY: rs.offsetY + dy }));
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
        setTextPos((tpos) => ({ x: Math.max(0, tpos.x + dx), y: Math.max(0, tpos.y + dy) }));
      } else if (g.type === 'drag_route') {
        setRouteStyle((rs) => ({ ...rs, offsetX: rs.offsetX + dx, offsetY: rs.offsetY + dy }));
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
      return { ...s, scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY };
    });
  }

  // export preserving original resolution
  function exportImage(asJpeg = false) {
    const img = imgRef.current;
    if (!img) return;
    const off = document.createElement("canvas");
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const ctx = off.getContext("2d");

    ctx.drawImage(img, 0, 0, off.width, off.height);

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
        const baseX = ((c.lon - minLon) / lonRange) * off.width;
        const baseY = ((maxLat - c.lat) / latRange) * off.height;
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
    ctx.font = `${textStyle.size}px system-ui, -apple-system, BlinkMacSystemFont`;
    ctx.fillStyle = textStyle.color;
    ctx.textBaseline = "top";
    const lines = buildActivityText().split("\n").filter(Boolean);
    let y = (textPos.y / canvasRef.current.height) * off.height;
    const x = (textPos.x / canvasRef.current.width) * off.width;
    lines.forEach((line) => {
      ctx.fillText(line, x, y);
      y += textStyle.size * 1.3;
    });
    ctx.restore();

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
    setTextPos({ x: 30, y: 60 });
  }

  return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-slate-800 via-slate-700 to-indigo-700 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-xl mx-auto">
        {page === "upload" && (
          <div className="backdrop-blur-xl bg-white/10 rounded-2xl p-8 text-center shadow-md">
            <h1 className="text-3xl font-semibold mb-4">Garmin Overlay</h1>
            <label className="inline-flex flex-col items-center justify-center cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onImageSelected(e.target.files?.[0])} />
              <div className="w-36 h-36 rounded-full bg-white/20 flex items-center justify-center text-xl font-medium shadow-lg">上传照片</div>
            </label>
          </div>
        )}

        {page === "activities" && (
          <div className="backdrop-blur-xl bg-white/8 rounded-2xl p-4 shadow-md">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-medium">选择活动</h2>
              <button className="text-sm opacity-90" onClick={() => setPage("upload")}>取消</button>
            </div>
            <div className="space-y-3 max-h-80 overflow-auto">
              {activities.length === 0 && <div className="p-4 text-sm opacity-80">正在加载或暂无活动</div>}
              {activities.map((a) => (
                <div key={a.activityId} className="p-3 rounded-xl bg-white/6 flex items-center justify-between" onClick={() => onSelectActivity(a)}>
                  <div>
                    <div className="font-semibold">{a.activityName}</div>
                    <div className="text-xs opacity-80">{a.startTimeLocal}</div>
                  </div>
                  <div className="text-right text-xs opacity-80">
                    <div>{(a.distance/1000).toFixed(2)} km</div>
                    <div>{formatDurationShort(a.duration)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {page === "editor" && (
          <div className="bg-white/5 rounded-2xl p-2 shadow-lg">
            <div className="flex items-center justify-between p-2">
              <button className="px-3 py-2 bg-white/6 rounded-lg" onClick={() => setPage("activities")}>返回</button>
              <div className="flex gap-2">
                <button className="px-3 py-2 bg-white/6 rounded-lg" onClick={() => { setOpenPanel('export'); }}>导出</button>
                <button className="px-3 py-2 bg-white/6 rounded-lg" onClick={() => resetTransforms()}>重置</button>
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
                <button className="px-3 py-2 rounded-lg bg-white/6" onClick={() => setOpenPanel(openPanel === 'text' ? null : 'text')}>文字</button>
                <button className="px-3 py-2 rounded-lg bg-white/6" onClick={() => setOpenPanel(openPanel === 'route' ? null : 'route')}>路线</button>
              </div>
            </div>

            {/* Sliding panels */}
            <div className={`fixed left-4 right-4 bottom-20 rounded-xl bg-white/6 backdrop-blur-xl p-4 transition-transform duration-300 ${openPanel ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0 pointer-events-none'}`}>
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

                  {/* 大小滑块 */}
                  <div className="flex flex-col items-center flex-1">
                    <input
                      type="range"
                      min={36}
                      max={120}
                      value={textStyle.size}
                      onChange={(e) =>
                        setTextStyle((s) => ({ ...s, size: Number(e.target.value) }))
                      }
                      className="w-full"
                    />
                  </div>
                </div>
              )}

              {openPanel === 'route' && (
                <div>
                  <div className="text-sm mb-2">宽度</div>
                  <input type="range" min={1} max={20} value={routeStyle.width} onChange={(e)=>setRouteStyle((s)=>({...s, width: Number(e.target.value)}))} className="w-full" />
                  <div className="text-sm mt-3 mb-2">缩放</div>
                  <div className="flex gap-2 items-center">
                    <button className="px-3 py-2 bg-white/6 rounded-lg" onClick={() => setRouteStyle((s)=>({...s, scale: Math.min(20, s.scale*1.12)}))}>放大</button>
                    <button className="px-3 py-2 bg-white/6 rounded-lg" onClick={() => setRouteStyle((s)=>({...s, scale: Math.max(0.05, s.scale*0.88)}))}>缩小</button>
                    <div className="ml-2">当前: {routeStyle.scale.toFixed(2)}x</div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <div className="text-sm">颜色</div>
                    <input type="color" value={routeStyle.color} onChange={(e)=>setRouteStyle((s)=>({...s, color:e.target.value}))} />
                    <div className="ml-4 text-sm">透明度</div>
                    <input type="range" min={0.1} max={1} step={0.05} value={routeStyle.alpha} onChange={(e)=>setRouteStyle((s)=>({...s, alpha: Number(e.target.value)}))} />
                  </div>
                </div>
              )}

              {openPanel === 'export' && (
                <div className="flex gap-3">
                  <button className="px-4 py-2 bg-white/6 rounded-lg" onClick={() => exportImage(false)}>导出 PNG</button>
                  <button className="px-4 py-2 bg-white/6 rounded-lg" onClick={() => exportImage(true)}>导出 JPG</button>
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
