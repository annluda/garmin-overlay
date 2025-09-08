import React, { useRef, useState, useEffect, useCallback } from "react";
import { Camera, ArrowBigLeft , UndoDot, Download , Trophy , MapPin , Blend , RulerDimensionLine, AlignVerticalSpaceAround, Pin, Plus , Trash, ZoomIn} from 'lucide-react'


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

  // 新增自定义文本框状态
  const [customTextBoxes, setCustomTextBoxes] = useState([]);
  const [selectedTextBox, setSelectedTextBox] = useState(null);
  const [showTextInput, setShowTextInput] = useState(false);

  const [openPanel, setOpenPanel] = useState(null); 
  const [activeAppearanceSlider, setActiveAppearanceSlider] = useState('width'); 

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

  // 新增函数：添加自定义文本框
  function addCustomTextBox() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const boxText = selectedActivity 
      ? selectedActivity.activityName 
      : "自定义文本";

    const newTextBox = {
      id: Date.now(),
      text: boxText,
      x: canvas.width / 2,
      y: canvas.height / 2,
      size: 36
    };

    setCustomTextBoxes(prev => [...prev, newTextBox]);
    setSelectedTextBox(newTextBox);
    setShowTextInput(true);
  }

  // 新增函数：更新自定义文本框
  function updateCustomTextBox(id, updates) {
    setCustomTextBoxes(prev => prev.map(box => 
      box.id === id ? { ...box, ...updates } : box
    ));
    if (selectedTextBox && selectedTextBox.id === id) {
      setSelectedTextBox(prev => ({ ...prev, ...updates }));
    }
  }

  // 新增函数：删除自定义文本框
  function deleteCustomTextBox(id) {
    setCustomTextBoxes(prev => prev.filter(box => box.id !== id));
    if (selectedTextBox && selectedTextBox.id === id) {
      setSelectedTextBox(null);
    }
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

    // draw original activity text
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

    // draw custom text boxes
    customTextBoxes.forEach((textBox) => {
      ctx.save();
      ctx.fillStyle = routeStyle.color;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.font = `${textBox.size}px system-ui, -apple-system, BlinkMacSystemFont, Roboto, Arial`;
      
      ctx.fillText(textBox.text, textBox.x, textBox.y);
      
      // draw selection border if selected
      if (selectedTextBox && selectedTextBox.id === textBox.id) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        const metrics = ctx.measureText(textBox.text);
        const textWidth = metrics.width;
        const textHeight = textBox.size;
        ctx.strokeStyle = "#007AFF";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.strokeRect(
          textBox.x - textWidth / 2 - 15,
          textBox.y - textHeight / 2 - 10,
          textWidth + 30,
          textHeight + 20
        );
        ctx.setLineDash([]);
      }
      ctx.restore();
    });
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
  }, [imageUrl, routeCoords, routeStyle, textStyle, textPos, routeBBox, selectedActivity, customTextBoxes, selectedTextBox]);

  useEffect(() => {
    if (page === 'editor' && routeBBox) {
      drawCanvas();
    }
  }, [routeBBox, page]);

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

  // 新增函数：检测点击的文本框
  function getClickedTextBox(x, y) {
    // 检查自定义文本框
    for (let i = customTextBoxes.length - 1; i >= 0; i--) {
      const textBox = customTextBoxes[i];
      const canvas = canvasRef.current;
      if (!canvas) continue;
      
      const ctx = canvas.getContext("2d");
      ctx.font = `${textBox.size}px 'FSDillonPro', system-ui, -apple-system, BlinkMacSystemFont, Roboto, Arial`;
      const textWidth = ctx.measureText(textBox.text).width;
      const textHeight = textBox.size;
      
      const left = textBox.x - textWidth / 2 - 10;
      const right = textBox.x + textWidth / 2 + 10;
      const top = textBox.y - textHeight / 2 - 5;
      const bottom = textBox.y + textHeight / 2 + 5;
      
      if (x >= left && x <= right && y >= top && y <= bottom) {
        return { type: 'custom', textBox };
      }
    }

    // 检查原始活动文本
    const textWidth = 420;
    const textHalfWidth = textWidth / 2;
    const textHeight = textStyle.size * 4;
    const textBox = { x: textPos.x - textHalfWidth, y: textPos.y, w: textWidth, h: textHeight };
    if (x >= textBox.x && x <= textBox.x + textBox.w && y >= textBox.y && y <= textBox.y + textBox.h) {
      return { type: 'activity' };
    }

    return null;
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
      const clickedText = getClickedTextBox(p.x, p.y);
      if (clickedText) {
        if (clickedText.type === 'custom') {
          setSelectedTextBox(clickedText.textBox);
          gestureRef.current = { type: 'drag_custom_text', last: p, textBoxId: clickedText.textBox.id };
        } else {
          gestureRef.current = { type: 'drag_text', last: p };
        }
      } else {
        setSelectedTextBox(null);
        gestureRef.current = { type: 'drag_route', last: p };
      }
    } else {
      // mouse event
      const p = clientToCanvas(e.clientX, e.clientY);
      const clickedText = getClickedTextBox(p.x, p.y);
      if (clickedText) {
        if (clickedText.type === 'custom') {
          setSelectedTextBox(clickedText.textBox);
          gestureRef.current = { type: 'drag_custom_text', last: p, textBoxId: clickedText.textBox.id };
        } else {
          gestureRef.current = { type: 'drag_text', last: p };
        }
      } else {
        setSelectedTextBox(null);
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
      } else if (g.type === 'drag_custom_text') {
        const moveAndUpdate = (box) => {
          const newX = box.x + dx;
          const newY = box.y + dy;

          // 边界检查
          const canvas = canvasRef.current;
          let clampedX = newX;
          let clampedY = newY;
          if (canvas) {
            const ctx = canvas.getContext("2d");
            ctx.font = `${box.size}px 'FSDillonPro', system-ui, -apple-system, BlinkMacSystemFont, Roboto, Arial`;
            const metrics = ctx.measureText(box.text);
            const textWidth = metrics.width;
            const textHeight = box.size;

            clampedX = Math.max(textWidth / 2, Math.min(newX, canvas.width - textWidth / 2));
            clampedY = Math.max(textHeight / 2, Math.min(newY, canvas.height - textHeight / 2));
          }
          return { ...box, x: clampedX, y: clampedY };
        };

        setCustomTextBoxes(prevBoxes =>
          prevBoxes.map(box => (box.id === g.textBoxId ? moveAndUpdate(box) : box))
        );
        setSelectedTextBox(prev => (prev && prev.id === g.textBoxId ? moveAndUpdate(prev) : prev));
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
      } else if (g.type === 'drag_custom_text') {
        const moveAndUpdate = (box) => {
          const newX = box.x + dx;
          const newY = box.y + dy;

          // 边界检查
          const canvas = canvasRef.current;
          let clampedX = newX;
          let clampedY = newY;
          if (canvas) {
            const ctx = canvas.getContext("2d");
            ctx.font = `${box.size}px 'FSDillonPro', system-ui, -apple-system, BlinkMacSystemFont, Roboto, Arial`;
            const metrics = ctx.measureText(box.text);
            const textWidth = metrics.width;
            const textHeight = box.size;

            clampedX = Math.max(textWidth / 2, Math.min(newX, canvas.width - textWidth / 2));
            clampedY = Math.max(textHeight / 2, Math.min(newY, canvas.height - textHeight / 2));
          }
          return { ...box, x: clampedX, y: clampedY };
        };

        setCustomTextBoxes(prevBoxes =>
          prevBoxes.map(box => (box.id === g.textBoxId ? moveAndUpdate(box) : box))
        );
        setSelectedTextBox(prev => (prev && prev.id === g.textBoxId ? moveAndUpdate(prev) : prev));
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

  function quickLayout() {
    const canvas = canvasRef.current;
    if (!canvas || !baseRouteBounds) return;

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const scale = routeStyle.scale;

    const routeBaseHeight = baseRouteBounds.maxY - baseRouteBounds.minY;
    const routeScaledHeight = routeBaseHeight * scale;
    const textHeight = textStyle.size * 4;
    const gap = canvasHeight * 0.05;
    const totalContentHeight = routeScaledHeight + textHeight + gap;
    const startY = Math.max(0, (canvasHeight - totalContentHeight) / 2);

    const routeBaseWidth = baseRouteBounds.maxX - baseRouteBounds.minX;
    const routeScaledWidth = routeBaseWidth * scale;
    const newRouteOffsetX = (canvasWidth - routeScaledWidth) / 2 - (baseRouteBounds.minX * scale);
    const newRouteOffsetY = startY - (baseRouteBounds.minY * scale);

    setRouteStyle(s => ({ ...s, offsetX: newRouteOffsetX, offsetY: newRouteOffsetY }));

    const newTextPosX = canvasWidth / 2;
    const newTextPosY = startY + routeScaledHeight + gap;
    setTextPos({ x: newTextPosX, y: newTextPosY });
  }

  function resetTransforms() {
    setRouteStyle((s) => ({ ...s, scale: 1, offsetX: 0, offsetY: 0 }));
    setTextPos({ x: 120, y: 60 });
    setCustomTextBoxes([]);
    setSelectedTextBox(null);
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

  // 文本输入对话框组件
  function TextInputModal({ isOpen, onClose, textBox, onSave }) {
    const [inputText, setInputText] = useState(textBox?.text || '');

    useEffect(() => {
      setInputText(textBox?.text || '');
    }, [textBox]);

    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 w-full max-w-md">
          <h3 className="text-lg font-semibold text-white mb-4">编辑文本</h3>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="w-full p-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="输入文本内容..."
            autoFocus
          />
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => {
                onSave(inputText);
                onClose();
              }}
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg font-medium transition"
            >
              确定
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white py-2 px-4 rounded-lg font-medium transition"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

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
                  onClick={quickLayout}
                >
                  <AlignVerticalSpaceAround />
                </button>
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
                <button className={`btn-reset px-4 py-2 rounded-xl font-medium transition duration-200 active:scale-95 ${openPanel === 'text' ? 'bg-black/30 text-white' : 'bg-transparent text-white'}`} onClick={() => handleButtonClick('text')}><Trophy /></button>
                <button className={`btn-reset px-4 py-2 rounded-xl font-medium transition duration-200 active:scale-95 ${openPanel === 'custom' ? 'bg-black/30 text-white' : 'bg-transparent text-white'}`} onClick={() => handleButtonClick('custom')}><Pin /></button>
                <button className={`btn-reset px-4 py-2 rounded-xl font-medium transition duration-200 active:scale-95 ${openPanel === 'route' ? 'bg-black/30 text-white' : 'bg-transparent text-white'}`} onClick={() => handleButtonClick('route')}><MapPin /></button>
                <button className={`btn-reset px-4 py-2 rounded-xl font-medium transition duration-200 active:scale-95 ${openPanel === 'route2' ? 'bg-black/30 text-white' : 'bg-transparent text-white'}`} onClick={() => handleButtonClick('route2')}><ZoomIn /></button>
              </div>
            </div>

            {/* Sliding panels */}
            <div className={`fixed left-4 right-4 bottom-20 rounded-xl bg-white/10 backdrop-blur-xl p-4 transition-transform ease-in-out duration-300 ${openPanel !== null ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 pointer-events-none'}`}>
              {openPanel === 'text' && (
                <div className="space-y-4 w-full">
                  {/* Unified Color Palette for Text */}
                  <div className="w-full">
                    <div className="text-sm text-gray-200 mb-2">颜色</div>
                    <div className="flex justify-around items-center gap-2">
                      {["#FF5100", "#007AFF", "#34C759", "#FFD60A", "#FFFFFF"].map(color => (
                        <button
                          key={color}
                          onClick={() => setTextStyle(s => ({ ...s, color: color }))}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${textStyle.color.toLowerCase() === color.toLowerCase() ? 'border-white scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Size Slider */}
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-16 text-sm text-gray-200">大小</div>
                    <input
                      type="range"
                      min={48}
                      max={200}
                      value={textStyle.size}
                      onChange={e => setTextStyle(s => ({ ...s, size: Number(e.target.value) }))}
                      className="flex-1 ios-slider"
                    />
                    <div className="w-10 text-sm text-right text-white">{textStyle.size}</div>
                  </div>
                </div>
              )}

              {openPanel === 'custom' && (
                <div className="space-y-4 w-full">
                  {selectedTextBox ? (
                    <>
                      {/* 编辑选中的文本框 */}
                      <div className="flex items-center gap-3 justify-between">
                        <button
                          onClick={() => setShowTextInput(true)}
                          className="w-full p-2 bg-white/10 rounded-lg text-left text-white truncate"
                        >
                          {selectedTextBox.text || "点击编辑文本"}
                        </button>
                        <button
                          className="w-10 h-10 flex items-center justify-center"
                          onClick={addCustomTextBox}
                        >
                          <Plus />
                        </button>
                        <button
                          className="w-10 h-10 flex items-center justify-center"
                          onClick={() => deleteCustomTextBox(selectedTextBox.id)}
                        >
                          <Trash />
                        </button>
                      </div>

                      {/* Size Slider */}
                      <div className="flex items-center gap-3 w-full">
                        <div className="w-16 text-sm text-gray-200">大小</div>
                        <input
                          type="range"
                          min={24}
                          max={72}
                          value={selectedTextBox.size}
                          onChange={e => updateCustomTextBox(selectedTextBox.id, { size: Number(e.target.value) })}
                          className="flex-1 ios-slider"
                        />
                        <div className="w-10 text-sm text-right text-white">{selectedTextBox.size}</div>
                      </div>

                      
                    </>
                  ) : (
                    <div>
                      <button
                        className="w-10 h-10 flex items-center justify-center"
                        onClick={addCustomTextBox}
                      >
                        <Plus />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {openPanel === 'route' && ( // Panel 1: Appearance
                <div className="space-y-4 w-full">
                  {/* Color Palette */}
                  <div className="w-full">
                    <div className="text-sm text-gray-200 mb-2">颜色</div>
                    <div className="flex justify-around items-center gap-2">
                      {["#FF5100", "#007AFF", "#34C759", "#FFD60A", "#FFFFFF"].map(color => (
                        <button
                          key={color}
                          onClick={() => setRouteStyle(s => ({ ...s, color: `${color}ff` }))}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${routeStyle.color.toLowerCase().startsWith(color.toLowerCase()) ? 'border-white scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Toggable Sliders for Width and Alpha */}
                  <div className="w-full">
                    <div className="flex items-center gap-4">
                      {/* Tab-like buttons for toggling */}
                      <div className="flex gap-2">
                        <button onClick={() => setActiveAppearanceSlider('width')} className={`btn-reset px-2 py-1 rounded-md text-sm font-medium transition text-white ${activeAppearanceSlider === 'width' ? 'bg-black/30 hover:bg-black/30 active:bg-black/30' : 'bg-transparent hover:bg-transparent active:bg-transparent'}`}>
                          <RulerDimensionLine />
                        </button>
                        <button onClick={() => setActiveAppearanceSlider('alpha')} className={`btn-reset px-2 py-1 rounded-md text-sm font-medium transition text-white ${activeAppearanceSlider === 'alpha' ? 'bg-black/30 hover:bg-black/30 active:bg-black/30' : 'bg-transparent hover:bg-transparent active:bg-transparent'}`}>
                          <Blend />
                        </button>
                      </div>

                      {/* The active slider, taking remaining space */}
                      <div className="flex-1">
                        {activeAppearanceSlider === 'width' && (
                          <div className="flex items-center gap-2 w-full">
                            <input
                              type="range"
                              min={10}
                              max={40}
                              value={routeStyle.width}
                              onChange={(e) => setRouteStyle((s) => ({ ...s, width: Number(e.target.value) }))}
                              className="flex-1 ios-slider"
                            />
                            <div className="w-10 text-sm text-right text-white">{routeStyle.width}</div>
                          </div>
                        )}
                        {activeAppearanceSlider === 'alpha' && (
                          <div className="flex items-center gap-2 w-full">
                            <input type="range" min={0.1} max={1} step={0.05} value={routeStyle.alpha} onChange={(e)=>setRouteStyle((s)=>({...s, alpha: Number(e.target.value)}))} className="flex-1 opacity-slider" />
                            <div className="w-10 text-sm text-right text-white">{routeStyle.alpha.toFixed(2)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {openPanel === 'route2' && ( // Panel 2: Transform
                <div className="space-y-4 w-full">
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-16 text-sm text-gray-200">缩放</div>
                    <input
                      type="range"
                      min={0.1}
                      max={2}
                      step={0.05}
                      value={routeStyle.scale}
                      onChange={(e) =>
                        setRouteStyle((s) => {
                          if (!baseRouteBounds) return s;
                          const newScale = Number(e.target.value);
                          const oldScale = s.scale;
                          
                          const routeCenterX = (baseRouteBounds.minX + baseRouteBounds.maxX) / 2;
                          const routeCenterY = (baseRouteBounds.minY + baseRouteBounds.maxY) / 2;

                          const newOffsetX = s.offsetX + routeCenterX * (oldScale - newScale);
                          const newOffsetY = s.offsetY + routeCenterY * (oldScale - newScale);

                          let clampedX = newOffsetX;
                          let clampedY = newOffsetY;
                          if (canvasRef.current) {
                            const sc = newScale;
                            const minOffX = - (baseRouteBounds.minX * sc);
                            const maxOffX = canvasRef.current.width - (baseRouteBounds.maxX * sc);
                            clampedX = Math.max(minOffX, Math.min(newOffsetX, maxOffX));
                            const minOffY = - (baseRouteBounds.minY * sc);
                            const maxOffY = canvasRef.current.height - (baseRouteBounds.maxY * sc);
                            clampedY = Math.max(minOffY, Math.min(newOffsetY, maxOffY));
                          }
                          return { ...s, scale: newScale, offsetX: clampedX, offsetY: clampedY };
                        })
                      }
                      className="flex-1 ios-slider"
                    />
                    <div className="w-10 text-sm text-right text-white">
                      {routeStyle.scale.toFixed(2)}
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* 文本输入模态框 */}
        <TextInputModal
          isOpen={showTextInput}
          onClose={() => setShowTextInput(false)}
          textBox={selectedTextBox}
          onSave={(text) => {
            if (selectedTextBox) {
              updateCustomTextBox(selectedTextBox.id, { text });
            }
          }}
        />
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
}