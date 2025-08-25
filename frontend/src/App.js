import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Download, RotateCcw, Activity, MapPin, Timer, Flame } from 'lucide-react';

const GarminActivityEditor = () => {
  // 状态管理
  const [activities, setActivities] = useState([]);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [gpxData, setGpxData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('upload'); // 'upload', 'selectActivity', 'edit'

  // 控制参数
  const [textSize, setTextSize] = useState(24);
  const [textColor, setTextColor] = useState('#F5F5F5');
  const [routeScale, setRouteScale] = useState(1);
  const [routeWidth, setRouteWidth] = useState(4);
  const [routeColor, setRouteColor] = useState('#FF5A3C');

  // 拖动相关状态
  const [textOffset, setTextOffset] = useState({ x: 0, y: 0 });
  const [routeOffset, setRouteOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [startOffset, setStartOffset] = useState({ x: 0, y: 0 });
  const [startTextSize, setStartTextSize] = useState(0);
  const [startRouteScale, setStartRouteScale] = useState(0);
  const [startRouteWidth, setStartRouteWidth] = useState(0);

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // API 基础 URL
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:9245';

  // 预设颜色
  const presetColors = [
    '#FF5A3C', '#FF6B6B', '#4ECDC4', '#45B7D1',
    '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E9', '#F8C471',
    '#FFFFFF', '#000000', '#FF0000', '#00FF00',
    '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'
  ];

  // 加载活动列表
  useEffect(() => {
    const loadActivities = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/activities`);
        if (!response.ok) throw new Error('网络请求失败');
        const data = await response.json();
        setActivities(data);
      } catch (err) {
        setError('加载活动失败: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    loadActivities();
  }, [API_BASE_URL]);

  // 选择活动
  const handleActivitySelect = useCallback(async (activity) => {
    setSelectedActivity(activity);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/activities/${activity.activityId}/gpx`);
      if (response.ok) {
        const gpxText = await response.text();
        const parsedGpx = parseGPX(gpxText);
        setGpxData(parsedGpx);
      }
    } catch (err) {
      console.error('Failed to load GPX:', err);
    }

    setStep('edit');
  }, [API_BASE_URL]);

  // 处理图片上传
  const handleImageUpload = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setUploadedImage(img);
        setStep('selectActivity');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }, []);

  // 拖拽处理
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleImageUpload(files[0]);
    }
  }, [handleImageUpload]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  // 更新画布
  useEffect(() => {
    if (!uploadedImage || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // 设置画布尺寸
    const containerRect = canvas.parentElement.getBoundingClientRect();
    const imgAspect = uploadedImage.width / uploadedImage.height;
    const containerAspect = containerRect.width / containerRect.height;

    let canvasWidth, canvasHeight;
    if (imgAspect > containerAspect) {
      canvasWidth = Math.min(800, containerRect.width - 40);
      canvasHeight = canvasWidth / imgAspect;
    } else {
      canvasHeight = Math.min(600, containerRect.height - 100);
      canvasWidth = canvasHeight * imgAspect;
    }

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // 清除画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制图片
    ctx.drawImage(uploadedImage, 0, 0, canvas.width, canvas.height);

    // 绘制路线
    let routeBounds = null;
    if (gpxData && gpxData.length > 0) {
      routeBounds = drawRoute(ctx, canvas, gpxData);
    }

    // 绘制活动信息
    let textBounds = null;
    if (selectedActivity) {
      textBounds = drawActivityInfo(ctx, selectedActivity);
    }

  }, [uploadedImage, gpxData, selectedActivity, textSize, textColor, routeScale, routeWidth, routeColor, textOffset, routeOffset]);

  // 绘制路线（优化后支持缩放，返回边界）
  const drawRoute = (ctx, canvas, points) => {
    if (points.length < 2) return null;

    const lats = points.map(p => p.lat);
    const lons = points.map(p => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const routeWidth_geo = maxLon - minLon;
    const routeHeight_geo = maxLat - minLat;

    // 使用整个画布
    const availableWidth = canvas.width;
    const availableHeight = canvas.height;
    const offsetX = 0;
    const offsetY = 0;

    // 基础边距，根据缩放调整
    const baseMargin = 50;
    const scaledMargin = baseMargin / routeScale;

    // 计算可用绘制区域，根据缩放调整
    const maxDrawWidth = (availableWidth - 2 * scaledMargin) * routeScale;
    const maxDrawHeight = (availableHeight - 2 * scaledMargin) * routeScale;

    const routeAspect = routeWidth_geo / routeHeight_geo;
    const drawAspect = maxDrawWidth / maxDrawHeight;

    let actualDrawWidth, actualDrawHeight;
    if (routeAspect > drawAspect) {
      actualDrawWidth = maxDrawWidth;
      actualDrawHeight = maxDrawWidth / routeAspect;
    } else {
      actualDrawHeight = maxDrawHeight;
      actualDrawWidth = maxDrawHeight * routeAspect;
    }

    // 居中计算偏移量，加上拖动偏移
    const centerOffsetX = offsetX + (availableWidth - actualDrawWidth) / 2 + routeOffset.x;
    const centerOffsetY = offsetY + (availableHeight - actualDrawHeight) / 2 + routeOffset.y;

    // 绘制路线
    ctx.beginPath();
    ctx.strokeStyle = routeColor;
    ctx.lineWidth = routeWidth * routeScale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    points.forEach((point, index) => {
      const x = centerOffsetX + ((point.lon - minLon) / (maxLon - minLon)) * actualDrawWidth;
      const y = centerOffsetY + ((maxLat - point.lat) / (maxLat - minLat)) * actualDrawHeight;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });

    ctx.stroke();

    // 调整边界以包含线宽
    const halfWidth = (routeWidth * routeScale) / 2;
    minX -= halfWidth;
    maxX += halfWidth;
    minY -= halfWidth;
    maxY += halfWidth;

    // 绘制缩放手柄（右下角）
    const handleSize = 10;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(maxX - handleSize, maxY - handleSize, handleSize, handleSize);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(maxX - handleSize, maxY - handleSize, handleSize, handleSize);

    // 绘制宽度手柄（左下角，可选）
    ctx.fillRect(minX, maxY - handleSize, handleSize, handleSize);
    ctx.strokeRect(minX, maxY - handleSize, handleSize, handleSize);

    return { minX, maxX, minY, maxY };
  };

  // 绘制活动信息（返回边界）
  const drawActivityInfo = (ctx, activity) => {
    const smallTextSize = textSize * 0.4;
    ctx.fillStyle = textColor;

    const distance = (activity.distance / 1000).toFixed(2);
    const duration = formatDuration(activity.duration);
    const elevation = activity.elevationGain.toFixed(0);

    const lines = [
      `距离`,
      `${distance} km`,
      `爬升海拔`,
      `${elevation} m`,
      `时间`,
      duration
    ];

    const textAreaHeight = textSize * 6; // 预估文字区域大小

    ctx.textAlign = 'center';
    let startX = ctx.canvas.width / 2 + textOffset.x;
    let startY = ctx.canvas.height - textAreaHeight + smallTextSize + textOffset.y;

    let currentY = startY;
    lines.forEach((line, index) => {
      if (index % 2 === 0) {
        ctx.font = `${smallTextSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
      } else {
        ctx.font = `${textSize}px 'DIN Alternate', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
      }
      ctx.fillText(line, startX, currentY);
      currentY += textSize;
    });

    // 计算边界
    let maxWidth = 0;
    lines.forEach((line, index) => {
      if (index % 2 === 0) {
        ctx.font = `${smallTextSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
      } else {
        ctx.font = `${textSize}px 'DIN Alternate', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
      }
      const metrics = ctx.measureText(line);
      maxWidth = Math.max(maxWidth, metrics.width);
    });

    const padding = 10;
    const left = startX - maxWidth / 2 - padding;
    const right = startX + maxWidth / 2 + padding;
    const top = startY - smallTextSize - padding;
    const bottom = startY + (textSize * 5) + padding;

    // 绘制缩放手柄（右下角）
    const handleSize = 10;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(right - handleSize, bottom - handleSize, handleSize, handleSize);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(right - handleSize, bottom - handleSize, handleSize, handleSize);

    return { left, right, top, bottom };
  };

  // 鼠标按下事件
  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const ctx = canvas.getContext('2d');

    // 先检查文字区域
    if (selectedActivity) {
      const smallTextSize = textSize * 0.4;
      const textAreaHeight = textSize * 6;

      ctx.textAlign = 'center';
      const startX = canvas.width / 2 + textOffset.x;
      const startY = canvas.height - textAreaHeight + smallTextSize + textOffset.y;

      // 计算最大宽度
      const lines = [
        `距离`,
        `${(selectedActivity.distance / 1000).toFixed(2)} km`,
        `爬升海拔`,
        `${selectedActivity.elevationGain.toFixed(0)} m`,
        `时间`,
        formatDuration(selectedActivity.duration)
      ];
      let maxWidth = 0;
      lines.forEach((line, index) => {
        if (index % 2 === 0) {
          ctx.font = `${smallTextSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
        } else {
          ctx.font = `${textSize}px 'DIN Alternate', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
        }
        const metrics = ctx.measureText(line);
        maxWidth = Math.max(maxWidth, metrics.width);
      });

      const padding = 10;
      const left = startX - maxWidth / 2 - padding;
      const right = startX + maxWidth / 2 + padding;
      const top = startY - smallTextSize - padding;
      const bottom = startY + (textSize * 5) + padding;

      // 检查缩放手柄
      const handleSize = 10;
      const handleLeft = right - handleSize;
      const handleTop = bottom - handleSize;
      const handleRight = right;
      const handleBottom = bottom;

      if (mouseX >= handleLeft && mouseX <= handleRight && mouseY >= handleTop && mouseY <= handleBottom) {
        setDragging('resize_text');
        setDragStart({ x: mouseX, y: mouseY });
        setStartTextSize(textSize);
        return;
      }

      // 检查文字区域以拖动
      if (mouseX >= left && mouseX <= right && mouseY >= top && mouseY <= bottom) {
        setDragging('text');
        setDragStart({ x: mouseX, y: mouseY });
        setStartOffset({ x: textOffset.x, y: textOffset.y });
        return;
      }
    }

    // 检查路线
    if (gpxData && gpxData.length > 0) {
      const points = gpxData;
      const lats = points.map(p => p.lat);
      const lons = points.map(p => p.lon);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLon = Math.min(...lons);
      const maxLon = Math.max(...lons);

      const routeWidth_geo = maxLon - minLon;
      const routeHeight_geo = maxLat - minLat;

      const availableWidth = canvas.width;
      const availableHeight = canvas.height;

      const baseMargin = 50;
      const scaledMargin = baseMargin / routeScale;

      const maxDrawWidth = (availableWidth - 2 * scaledMargin) * routeScale;
      const maxDrawHeight = (availableHeight - 2 * scaledMargin) * routeScale;

      const routeAspect = routeWidth_geo / routeHeight_geo;
      const drawAspect = maxDrawWidth / maxDrawHeight;

      let actualDrawWidth, actualDrawHeight;
      if (routeAspect > drawAspect) {
        actualDrawWidth = maxDrawWidth;
        actualDrawHeight = maxDrawWidth / routeAspect;
      } else {
        actualDrawHeight = maxDrawHeight;
        actualDrawWidth = maxDrawHeight * routeAspect;
      }

      const centerOffsetX = (availableWidth - actualDrawWidth) / 2 + routeOffset.x;
      const centerOffsetY = (availableHeight - actualDrawHeight) / 2 + routeOffset.y;

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

      points.forEach((point) => {
        const x = centerOffsetX + ((point.lon - minLon) / (maxLon - minLon)) * actualDrawWidth;
        const y = centerOffsetY + ((maxLat - point.lat) / (maxLat - minLat)) * actualDrawHeight;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      });

      const halfWidth = (routeWidth * routeScale) / 2;
      minX -= halfWidth;
      maxX += halfWidth;
      minY -= halfWidth;
      maxY += halfWidth;

      // 检查缩放手柄（右下角）
      const handleSize = 10;
      const scaleHandleLeft = maxX - handleSize;
      const scaleHandleTop = maxY - handleSize;
      const scaleHandleRight = maxX;
      const scaleHandleBottom = maxY;

      if (mouseX >= scaleHandleLeft && mouseX <= scaleHandleRight && mouseY >= scaleHandleTop && mouseY <= scaleHandleBottom) {
        setDragging('resize_route_scale');
        setDragStart({ x: mouseX, y: mouseY });
        setStartRouteScale(routeScale);
        return;
      }

      // 检查宽度手柄（左下角）
      const widthHandleLeft = minX;
      const widthHandleTop = maxY - handleSize;
      const widthHandleRight = minX + handleSize;
      const widthHandleBottom = maxY;

      if (mouseX >= widthHandleLeft && mouseX <= widthHandleRight && mouseY >= widthHandleTop && mouseY <= widthHandleBottom) {
        setDragging('resize_route_width');
        setDragStart({ x: mouseX, y: mouseY });
        setStartRouteWidth(routeWidth);
        return;
      }

      // 检查路线路径以拖动
      ctx.beginPath();
      ctx.lineWidth = routeWidth * routeScale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      points.forEach((point, index) => {
        const x = centerOffsetX + ((point.lon - minLon) / (maxLon - minLon)) * actualDrawWidth;
        const y = centerOffsetY + ((maxLat - point.lat) / (maxLat - minLat)) * actualDrawHeight;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      if (ctx.isPointInStroke(mouseX, mouseY)) {
        setDragging('route');
        setDragStart({ x: mouseX, y: mouseY });
        setStartOffset({ x: routeOffset.x, y: routeOffset.y });
        return;
      }
    }
  };

  // 鼠标移动事件
  const handleMouseMove = (e) => {
    if (!dragging) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const dx = mouseX - dragStart.x;
    const dy = mouseY - dragStart.y;

    if (dragging === 'text' || dragging === 'route') {
      if (dragging === 'text') {
        setTextOffset({ x: startOffset.x + dx, y: startOffset.y + dy });
      } else if (dragging === 'route') {
        setRouteOffset({ x: startOffset.x + dx, y: startOffset.y + dy });
      }
    } else if (dragging === 'resize_text') {
      setTextSize(Math.max(12, Math.min(48, startTextSize + dy / 5)));
    } else if (dragging === 'resize_route_scale') {
      setRouteScale(Math.max(0.3, Math.min(2, startRouteScale + dy / 100)));
    } else if (dragging === 'resize_route_width') {
      setRouteWidth(Math.max(1, Math.min(12, startRouteWidth + dy / 10)));
    }
  };

  // 鼠标抬起事件
  const handleMouseUp = () => {
    setDragging(null);
  };

  // 颜色选择器组件
  const ColorPicker = ({ value, onChange, colors }) => (
    <div className="flex flex-wrap gap-1">
      {colors.map((color) => (
        <button
          key={color}
          onClick={() => onChange(color)}
          className={`w-6 h-6 rounded border-2 ${
            value === color ? 'border-gray-800' : 'border-gray-300'
          }`}
          style={{ backgroundColor: color }}
          title={color}
        />
      ))}
    </div>
  );

  // 下载图片
  const handleDownload = () => {
    if (!canvasRef.current) return;

    const link = document.createElement('a');
    link.download = `${selectedActivity?.activityName || 'activity'}.png`;
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  // 重置设置
  const handleReset = () => {
    setTextSize(24);
    setTextColor('#F5F5F5');
    setRouteScale(1);
    setRouteWidth(4);
    setRouteColor('#FF5A3C');
    setTextOffset({ x: 0, y: 0 });
    setRouteOffset({ x: 0, y: 0 });
  };

  // 工具函数
  const parseGPX = (gpxText) => {
    const parser = new DOMParser();
    const gpxDoc = parser.parseFromString(gpxText, 'text/xml');
    const trackPoints = gpxDoc.querySelectorAll('trkpt');

    const points = [];
    trackPoints.forEach(trkpt => {
      const lat = parseFloat(trkpt.getAttribute('lat'));
      const lon = parseFloat(trkpt.getAttribute('lon'));
      if (!isNaN(lat) && !isNaN(lon)) {
        points.push({ lat, lon });
      }
    });

    return points;
  };

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const getActivityIcon = (type) => {
    switch (type.toLowerCase()) {
      case 'cycling': return '🚴';
      case 'running': return '🏃';
      case 'swimming': return '🏊';
      default: return '🏃';
    }
  };

  const cursorClass = dragging
    ? dragging.startsWith('resize')
      ? 'cursor-nwse-resize'
      : 'cursor-grabbing'
    : 'cursor-auto';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600">
      <div className="container mx-auto p-5 max-w-7xl">
        <h1 className="text-4xl font-light text-white text-center mb-8">
          S T R A V A
        </h1>

        {step === 'upload' && (
          <div className="h-[calc(100vh-150px)] flex items-center justify-center">
            <div className="text-center w-full max-w-2xl">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-16 cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-all duration-300 bg-white/95 backdrop-blur-xl shadow-xl"
              >
                <Upload className="mx-auto mb-4 text-teal-500" size={48} />
                <h2 className="text-xl font-semibold text-gray-700 mb-2">上传背景图片</h2>
                <p className="text-gray-500">
                  点击或拖拽图片文件到这里
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e.target.files[0])}
                  className="hidden"
                />
              </div>
            </div>
          </div>
        )}

        {step === 'selectActivity' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 h-[calc(100vh-150px)]">
            {/* 活动列表 */}
            <div className="lg:col-span-1 bg-white/95 backdrop-blur-xl rounded-2xl p-5 shadow-xl overflow-y-auto">
              <h2 className="text-lg font-semibold text-indigo-600 mb-4 flex items-center gap-2">
                <Activity size={20} />
                活动列表
              </h2>

              {loading && (
                <div className="text-center py-8">
                  <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                  <p className="text-gray-600">加载中...</p>
                </div>
              )}

              {error && (
                <div className="text-center py-4 text-red-500 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                {activities.map((activity) => (
                  <div
                    key={activity.activityId}
                    onClick={() => handleActivitySelect(activity)}
                    className={`p-4 rounded-xl cursor-pointer transition-all duration-300 border-2 ${
                      selectedActivity?.activityId === activity.activityId
                        ? 'bg-teal-500 text-white border-teal-600 shadow-lg'
                        : 'bg-gray-50 hover:bg-teal-50 border-transparent hover:border-teal-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{getActivityIcon(activity.activityType)}</span>
                      <h3 className="font-semibold text-sm truncate flex-1">
                        {activity.activityName}
                      </h3>
                    </div>
                    <div className="text-xs opacity-90 space-y-1">
                      <div className="flex items-center gap-1">
                        <MapPin size={12} />
                        {(activity.distance / 1000).toFixed(1)}km
                      </div>
                      <div className="flex items-center gap-1">
                        <Timer size={12} />
                        {formatDuration(activity.duration)}
                      </div>
                      <div className="flex items-center gap-1">
                        <Flame size={12} />
                        {activity.calories}卡
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 图片预览 */}
            <div className="lg:col-span-3 bg-white/95 backdrop-blur-xl rounded-2xl p-5 shadow-xl overflow-hidden">
              <div className="relative w-full h-full flex items-center justify-center">
                <canvas
                  ref={canvasRef}
                  className="max-w-full max-h-full rounded-xl shadow-lg"
                />
              </div>
            </div>
          </div>
        )}

        {step === 'edit' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 h-[calc(100vh-150px)]">
            {/* 侧边栏 - 只显示颜色控制和按钮 */}
            <div className="lg:col-span-1 bg-white/95 backdrop-blur-xl rounded-2xl p-5 shadow-xl overflow-y-auto">
              <div className="space-y-6">
                {/* 文字控制 */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">文字设置</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-2">文字颜色</label>
                      <ColorPicker
                        value={textColor}
                        onChange={setTextColor}
                        colors={presetColors}
                      />
                    </div>
                  </div>
                </div>

                {/* 路线控制 */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">路线设置</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-2">路线颜色</label>
                      <ColorPicker
                        value={routeColor}
                        onChange={setRouteColor}
                        colors={presetColors}
                      />
                    </div>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-2">
                  <button
                    onClick={handleDownload}
                    className="flex-1 flex items-center justify-center gap-2 bg-teal-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors"
                  >
                    <Download size={16} />
                    下载
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex-1 flex items-center justify-center gap-2 bg-gray-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors"
                  >
                    <RotateCcw size={16} />
                    重置
                  </button>
                </div>
              </div>
            </div>

            {/* 主编辑区 */}
            <div className="lg:col-span-3 bg-white/95 backdrop-blur-xl rounded-2xl p-5 shadow-xl overflow-hidden">
              <div className="relative w-full h-full flex items-center justify-center">
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  className={`max-w-full max-h-full rounded-xl shadow-lg ${cursorClass}`}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GarminActivityEditor;