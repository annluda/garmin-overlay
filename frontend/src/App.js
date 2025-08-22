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

  // 控制参数
  const [textSize, setTextSize] = useState(24);
  const [textColor, setTextColor] = useState('#F5F5F5');
  const [routeScale, setRouteScale] = useState(1);
  const [routeWidth, setRouteWidth] = useState(4);
  const [routeColor, setRouteColor] = useState('#FF5A3C');

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // API 基础 URL
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:9245';


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
  }, [API_BASE_URL]);

  // 处理图片上传
  const handleImageUpload = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => setUploadedImage(img);
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
    if (gpxData && gpxData.length > 0) {
      drawRoute(ctx, canvas, gpxData);
    }

    // 绘制活动信息
    if (selectedActivity) {
      drawActivityInfo(ctx, selectedActivity);
    }
  }, [uploadedImage, gpxData, selectedActivity, textSize, textColor, routeScale, routeWidth, routeColor]);

  // 绘制路线（优化后支持缩放）
  const drawRoute = (ctx, canvas, points) => {
    if (points.length < 2) return;

    const lats = points.map(p => p.lat);
    const lons = points.map(p => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const routeWidth_geo = maxLon - minLon;
    const routeHeight_geo = maxLat - minLat;

    // 基础边距，根据缩放调整
    const baseMargin = 50;
    const scaledMargin = baseMargin / routeScale;

    // 计算可用绘制区域，根据缩放调整
    const maxDrawWidth = (canvas.width - 2 * scaledMargin) * routeScale;
    const maxDrawHeight = (canvas.height - 2 * scaledMargin) * routeScale;

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

    // 居中计算偏移量
    const offsetX = (canvas.width - actualDrawWidth) / 2;
    const offsetY = (canvas.height - actualDrawHeight) / 2;

    // 绘制路线
    ctx.beginPath();
    ctx.strokeStyle = routeColor;
    ctx.lineWidth = routeWidth * routeScale; // 路线宽度也跟随缩放
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    points.forEach((point, index) => {
      const x = offsetX + ((point.lon - minLon) / (maxLon - minLon)) * actualDrawWidth;
      const y = offsetY + ((maxLat - point.lat) / (maxLat - minLat)) * actualDrawHeight;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

  };

  // 绘制活动信息（居中显示）
  const drawActivityInfo = (ctx, activity) => {
    const smallTextSize = textSize * 0.4;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center'; // 改为居中对齐

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

    // 计算总文本块高度（从第一个基线到最后一个基线的跨度）
    const numSmallGaps = 3; // 每个标签后的小间距
    const numLargeGaps = 2; // 每个值后的大切割
    const totalTextHeight = numSmallGaps * textSize + numLargeGaps * textSize;

    // 垂直居中起始位置
    const startY = (ctx.canvas.height - totalTextHeight) / 2 + smallTextSize;

    // 水平居中位置
    const centerX = ctx.canvas.width / 2;
    let currentY = startY;
    lines.forEach((line, index) => {
        if (index % 2 === 0) {
          ctx.font = `${smallTextSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
        } else {
          ctx.font = `${textSize}px 'DIN Alternate', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
        }
      ctx.fillText(line, centerX, currentY);
      currentY += textSize;
    });
  };

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
    setTextColor('#ffffff');
    setRouteScale(1);
    setRouteWidth(4);
    setRouteColor('#ff4757');
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600">
      <div className="container mx-auto p-5 max-w-7xl">
        <h1 className="text-4xl font-light text-white text-center mb-8">
          Garmin Activity Image Editor
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 h-[calc(100vh-150px)]">
          {/* 侧边栏 */}
          <div className="lg:col-span-1 bg-white/95 backdrop-blur-xl rounded-2xl p-5 shadow-xl overflow-y-auto">
            {/* 活动列表 */}
            <div className="mb-6">
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

            {/* 图片上传 */}
            <div>
              <h2 className="text-lg font-semibold text-indigo-600 mb-4 flex items-center gap-2">
                <Upload size={20} />
                上传图片
              </h2>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-all duration-300"
              >
                <Upload className="mx-auto mb-3 text-teal-500" size={32} />
                <p className="text-gray-600 text-sm">
                  点击或拖拽上传图片
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

          {/* 主编辑区 */}
          <div className="lg:col-span-3 bg-white/95 backdrop-blur-xl rounded-2xl p-5 shadow-xl overflow-hidden">
            <div className="relative w-full h-full flex items-center justify-center">
              {uploadedImage ? (
                <>
                  <canvas
                    ref={canvasRef}
                    className="max-w-full max-h-full rounded-xl shadow-lg"
                  />

                  {/* 控制面板 */}
                  <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 bg-white/95 backdrop-blur-xl px-6 py-4 rounded-full shadow-xl">
                    <div className="flex items-center gap-6">
                      {/* 文字控制 */}
                      <div className="flex items-center gap-3">
                        <label className="text-xs font-medium text-gray-600">文字大小</label>
                        <input
                          type="range"
                          min="12"
                          max="48"
                          value={textSize}
                          onChange={(e) => setTextSize(parseInt(e.target.value))}
                          className="w-16 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />

                        <label className="text-xs font-medium text-gray-600">文字颜色</label>
                        <input
                          type="color"
                          value={textColor}
                          onChange={(e) => setTextColor(e.target.value)}
                          className="w-6 h-6 border-none rounded-full cursor-pointer"
                        />
                      </div>

                      {/* 路线控制 */}
                      <div className="flex items-center gap-3 border-l pl-6 border-gray-200">
                        <label className="text-xs font-medium text-gray-600">路线缩放</label>
                        <input
                          type="range"
                          min="0.3"
                          max="2"
                          step="0.1"
                          value={routeScale}
                          onChange={(e) => setRouteScale(parseFloat(e.target.value))}
                          className="w-16 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />

                        <label className="text-xs font-medium text-gray-600">路线颜色</label>
                        <input
                          type="color"
                          value={routeColor}
                          onChange={(e) => setRouteColor(e.target.value)}
                          className="w-6 h-6 border-none rounded-full cursor-pointer"
                        />
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex gap-2 border-l pl-6 border-gray-200">
                        <button
                          onClick={handleDownload}
                          className="flex items-center gap-2 bg-teal-500 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-teal-600 transition-colors"
                        >
                          <Download size={16} />
                          下载
                        </button>
                        <button
                          onClick={handleReset}
                          className="flex items-center gap-2 bg-gray-500 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-gray-600 transition-colors"
                        >
                          <RotateCcw size={16} />
                          重置
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center text-gray-500">
                  <Activity className="mx-auto mb-4 text-gray-300" size={64} />
                  <p className="text-lg">选择活动并上传图片开始编辑</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GarminActivityEditor;