import React, { useState, useRef, useEffect } from 'react';
import { Upload, ArrowLeft, Download, Move, Type, Route, Undo, Redo, Calendar, MapPin, Clock, Flame, TrendingUp } from 'lucide-react';

const GarminOverlayApp = () => {
  const [currentPage, setCurrentPage] = useState('upload'); // 'upload', 'activities', 'editor'
  const [uploadedImage, setUploadedImage] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [gpxData, setGpxData] = useState(null);

  // 编辑器状态
  const [textStyle, setTextStyle] = useState({
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: 'bold',
    position: { x: 50, y: 50 }
  });

  const [routeStyle, setRouteStyle] = useState({
    color: '#FF3B30',
    width: 4,
    opacity: 0.8,
    scale: 1,
    position: { x: 0, y: 0 }
  });

  const [showTextPanel, setShowTextPanel] = useState(false);
  const [showRoutePanel, setShowRoutePanel] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [isDragging, setIsDragging] = useState(null); // 'text' | 'route' | null
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

  // 模拟活动数据（如果API不可用时使用）
  const mockActivities = [
    {
      activityId: 1,
      activityName: "Morning Ride",
      startTimeLocal: "2025-08-20 07:30:00",
      activityType: "cycling",
      distance: 12000,
      duration: 3600,
      calories: 450,
      elevationGain: 50
    },
    {
      activityId: 2,
      activityName: "Evening Run",
      startTimeLocal: "2025-08-19 18:00:00",
      activityType: "running",
      distance: 8000,
      duration: 2400,
      calories: 380,
      elevationGain: 30
    },
    {
      activityId: 3,
      activityName: "Weekend Hike",
      startTimeLocal: "2025-08-18 09:00:00",
      activityType: "hiking",
      distance: 15000,
      duration: 5400,
      calories: 650,
      elevationGain: 200
    }
  ];

  // 处理图片上传
  const handleImageUpload = (file) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImage(e.target.result);
        setCurrentPage('activities');
        loadActivities();
      };
      reader.readAsDataURL(file);
    }
  };

  // 加载活动列表
  const loadActivities = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:9245/activities');
      if (response.ok) {
        const data = await response.json();
        setActivities(data);
      } else {
        // 如果API不可用，使用模拟数据
        setActivities(mockActivities);
      }
    } catch (error) {
      console.log('API不可用，使用模拟数据');
      setActivities(mockActivities);
    }
    setLoading(false);
  };

  // 选择活动
  const selectActivity = async (activity) => {
    setSelectedActivity(activity);
    setLoading(true);

    try {
      // 尝试获取GPX数据
      const response = await fetch(`http://localhost:9245/activities/${activity.activityId}/gpx`);
      if (response.ok) {
        const gpxText = await response.text();
        setGpxData(parseGPX(gpxText));
      } else {
        // 模拟GPX数据
        setGpxData(generateMockGPXData());
      }
    } catch (error) {
      console.log('GPX数据不可用，使用模拟数据');
      setGpxData(generateMockGPXData());
    }

    setLoading(false);
    setCurrentPage('editor');
  };

  // 解析GPX数据
  const parseGPX = (gpxText) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, 'text/xml');
    const trackPoints = xmlDoc.querySelectorAll('trkpt');

    const points = Array.from(trackPoints).map(point => ({
      lat: parseFloat(point.getAttribute('lat')),
      lon: parseFloat(point.getAttribute('lon'))
    }));

    return points;
  };

  // 生成模拟GPX数据
  const generateMockGPXData = () => {
    const points = [];
    const centerLat = 40.7589;
    const centerLon = -73.9851;

    for (let i = 0; i < 50; i++) {
      points.push({
        lat: centerLat + (Math.random() - 0.5) * 0.01,
        lon: centerLon + (Math.random() - 0.5) * 0.01
      });
    }

    return points;
  };

  // 格式化距离
  const formatDistance = (meters) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)}km`;
    }
    return `${meters}m`;
  };

  // 格式化时间
  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // 格式化日期
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 获取活动类型图标
  const getActivityIcon = (type) => {
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

  // 绘制画布内容
  const drawCanvas = () => {
    if (!uploadedImage || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;

      // 清空画布
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 绘制背景图片
      ctx.drawImage(img, 0, 0);

      // 绘制运动数据文字
      if (selectedActivity) {
        ctx.font = `${textStyle.fontWeight} ${textStyle.fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
        ctx.fillStyle = textStyle.color;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 2;

        const text = `${selectedActivity.activityName}
${formatDistance(selectedActivity.distance)} • ${formatDuration(selectedActivity.duration)}
${selectedActivity.calories} cal • ${selectedActivity.elevationGain}m ↑`;

        const lines = text.split('\n');
        lines.forEach((line, index) => {
          const y = textStyle.position.y + (index * textStyle.fontSize * 1.2);
          ctx.strokeText(line, textStyle.position.x, y);
          ctx.fillText(line, textStyle.position.x, y);
        });
      }

      // 绘制GPX路线
      if (gpxData && gpxData.length > 1) {
        ctx.strokeStyle = routeStyle.color;
        ctx.lineWidth = routeStyle.width;
        ctx.globalAlpha = routeStyle.opacity;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 计算路线边界
        const lats = gpxData.map(p => p.lat);
        const lons = gpxData.map(p => p.lon);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);

        // 映射到画布坐标
        const mapPoint = (lat, lon) => {
          const x = ((lon - minLon) / (maxLon - minLon)) * canvas.width * 0.3 + canvas.width * 0.1 + routeStyle.position.x;
          const y = ((maxLat - lat) / (maxLat - minLat)) * canvas.height * 0.3 + canvas.height * 0.6 + routeStyle.position.y;
          return { x, y };
        };

        ctx.beginPath();
        gpxData.forEach((point, index) => {
          const { x, y } = mapPoint(point.lat, point.lon);
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      setCanvasReady(true);
    };

    img.src = uploadedImage;
  };

  // 获取鼠标在画布上的坐标
  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  // 检查点击是否在文字区域内
  const isPointInText = (x, y) => {
    if (!selectedActivity) return false;

    const canvas = canvasRef.current;
    if (!canvas) return false;

    const textX = textStyle.position.x;
    const textY = textStyle.position.y - textStyle.fontSize;

    // 估算文字宽度和高度
    const ctx = canvas.getContext('2d');
    ctx.font = `${textStyle.fontWeight} ${textStyle.fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;

    const lines = [
      selectedActivity.activityName,
      `${formatDistance(selectedActivity.distance)} • ${formatDuration(selectedActivity.duration)}`,
      `${selectedActivity.calories} cal • ${selectedActivity.elevationGain}m ↑`
    ];

    const textWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
    const textHeight = textStyle.fontSize * 3.6; // 3行文字的高度

    return x >= textX && x <= textX + textWidth &&
           y >= textY && y <= textY + textHeight;
  };

  // 检查点击是否在路线区域内
  const isPointInRoute = (x, y) => {
    if (!gpxData || gpxData.length < 2 || !canvasRef.current) return false;

    const canvas = canvasRef.current;
    const routeX = canvas.width * 0.1 + routeStyle.position.x;
    const routeY = canvas.height * 0.6 + routeStyle.position.y;
    const routeWidth = canvas.width * 0.3;
    const routeHeight = canvas.height * 0.3;

    // 扩大点击区域，方便用户点击
    const padding = 20;
    return x >= routeX - padding && x <= routeX + routeWidth + padding &&
           y >= routeY - padding && y <= routeY + routeHeight + padding;
  };

  // 鼠标按下事件
  const handleMouseDown = (e) => {
    const coords = getCanvasCoordinates(e);

    // 检查是否点击在文字上
    if (isPointInText(coords.x, coords.y)) {
      setIsDragging('text');
      setDragStart({
        x: coords.x - textStyle.position.x,
        y: coords.y - textStyle.position.y
      });
      return;
    }

    // 检查是否点击在路线上
    if (isPointInRoute(coords.x, coords.y)) {
      setIsDragging('route');
      setDragStart({
        x: coords.x - routeStyle.position.x,
        y: coords.y - routeStyle.position.y
      });
      return;
    }
  };

  // 鼠标移动事件
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();

    const coords = getCanvasCoordinates(e);

    if (isDragging === 'text') {
      setTextStyle(prev => ({
        ...prev,
        position: {
          x: Math.max(0, Math.min(coords.x - dragStart.x, canvasRef.current?.width - 300 || 0)),
          y: Math.max(textStyle.fontSize, Math.min(coords.y - dragStart.y, canvasRef.current?.height - 20 || 0))
        }
      }));
    } else if (isDragging === 'route') {
      setRouteStyle(prev => ({
        ...prev,
        position: {
          x: Math.max(-100, Math.min(coords.x - dragStart.x, 100)),
          y: Math.max(-100, Math.min(coords.y - dragStart.y, 100))
        }
      }));
    }
  };

  // 鼠标释放事件
  const handleMouseUp = () => {
    setIsDragging(null);
    setDragStart({ x: 0, y: 0 });
  };

  // 全局鼠标事件监听
  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMouseMove = (e) => {
      handleMouseMove(e);
    };

    const handleGlobalMouseUp = (e) => {
      handleMouseUp();
    };

    // 添加全局事件监听
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, dragStart]);

  // 触摸事件处理
  const handleTouchStart = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    if (!isDragging) return;
    const touch = e.touches[0];
    handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
  };

  const handleTouchEnd = (e) => {
    e.preventDefault();
    handleMouseUp();
  };

  // 监听样式变化重绘画布
  useEffect(() => {
    if (currentPage === 'editor') {
      drawCanvas();
    }
  }, [currentPage, uploadedImage, selectedActivity, gpxData, textStyle, routeStyle]);

  // 导出图片
  const exportImage = () => {
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = `garmin-overlay-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  // 渲染上传页
  const renderUploadPage = () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="backdrop-blur-xl bg-white/10 rounded-3xl p-8 shadow-2xl max-w-md w-full text-center">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Garmin Overlay</h1>
          <p className="text-white/80">为您的照片添加运动数据</p>
        </div>

        <div
          className="border-2 border-dashed border-white/30 rounded-2xl p-12 mb-6 transition-all duration-300 hover:border-white/50 hover:bg-white/5 cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            handleImageUpload(file);
          }}
        >
          <Upload className="w-16 h-16 text-white/70 mx-auto mb-4" />
          <p className="text-white/80 text-lg mb-2">上传图片</p>
          <p className="text-white/60 text-sm">支持拖拽或点击选择</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleImageUpload(e.target.files[0])}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full bg-white/20 hover:bg-white/30 text-white font-medium py-3 px-6 rounded-2xl transition-all duration-200 backdrop-blur-sm"
        >
          选择图片
        </button>
      </div>
    </div>
  );

  // 渲染活动选择页
  const renderActivitiesPage = () => (
    <div
      className="min-h-screen bg-cover bg-center relative"
      style={{ backgroundImage: `url(${uploadedImage})` }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

      <div className="relative z-10 p-4">
        <div className="flex items-center justify-between mb-6 pt-4">
          <button
            onClick={() => setCurrentPage('upload')}
            className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-all duration-200 backdrop-blur-sm"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>

          <h2 className="text-xl font-semibold text-white">选择活动</h2>
          <div className="w-10"></div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : (
          <div className="space-y-3 max-w-md mx-auto">
            {activities.map((activity) => (
              <div
                key={activity.activityId}
                onClick={() => selectActivity(activity)}
                className="backdrop-blur-xl bg-white/10 rounded-2xl p-4 cursor-pointer transition-all duration-200 hover:bg-white/20 hover:scale-105"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{getActivityIcon(activity.activityType)}</span>
                    <div>
                      <h3 className="text-white font-medium">{activity.activityName}</h3>
                      <p className="text-white/70 text-sm flex items-center">
                        <Calendar className="w-3 h-3 mr-1" />
                        {formatDate(activity.startTimeLocal)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-white/80 text-sm">
                  <div className="flex items-center space-x-1">
                    <MapPin className="w-4 h-4" />
                    <span>{formatDistance(activity.distance)}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Clock className="w-4 h-4" />
                    <span>{formatDuration(activity.duration)}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Flame className="w-4 h-4" />
                    <span>{activity.calories} cal</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <TrendingUp className="w-4 h-4" />
                    <span>{activity.elevationGain}m</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // 渲染编辑器页面
  const renderEditorPage = () => (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部工具栏 */}
      <div className="bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-200/50 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <button
          onClick={() => setCurrentPage('activities')}
          className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-all duration-200"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>

        <h2 className="text-lg font-semibold text-gray-900">编辑图片</h2>

        <button
          onClick={exportImage}
          disabled={!canvasReady}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white px-4 py-2 rounded-xl flex items-center space-x-2 transition-all duration-200 shadow-sm"
        >
          <Download className="w-4 h-4" />
          <span>导出</span>
        </button>
      </div>

      {/* 主编辑区域 */}
      <div className="flex-1 p-4 pb-20">
        <div className="max-w-4xl mx-auto">
          {/* 画布区域 */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="relative">
              <canvas
                ref={canvasRef}
                className={`w-full h-auto max-h-[70vh] object-contain select-none ${
                  isDragging ? 'cursor-grabbing' : 'cursor-grab'
                }`}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{
                  touchAction: 'none',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none'
                }}
              />
              {!canvasReady && uploadedImage && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 底部浮动工具栏 */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40">
        <div className="flex items-center space-x-3">
          {/* 拖拽提示 */}
          {isDragging && (
            <div className="bg-black/80 text-white text-sm px-3 py-2 rounded-xl backdrop-blur-sm mr-4 animate-pulse">
              <div className="flex items-center space-x-2">
                <Move className="w-4 h-4" />
                <span>拖拽{isDragging === 'text' ? '文字' : '路线'}中...</span>
              </div>
            </div>
          )}

          {/* 文字工具按钮 */}
          <button
            onClick={() => {
              setShowTextPanel(!showTextPanel);
              setShowRoutePanel(false);
            }}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-lg ${
              showTextPanel
                ? 'bg-blue-500 text-white shadow-blue-500/25'
                : 'bg-white/90 backdrop-blur-md text-gray-700 hover:bg-white shadow-black/10'
            }`}
          >
            <Type className="w-6 h-6" />
          </button>

          {/* 路线工具按钮 */}
          <button
            onClick={() => {
              setShowRoutePanel(!showRoutePanel);
              setShowTextPanel(false);
            }}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-lg ${
              showRoutePanel
                ? 'bg-red-500 text-white shadow-red-500/25'
                : 'bg-white/90 backdrop-blur-md text-gray-700 hover:bg-white shadow-black/10'
            }`}
          >
            <Route className="w-6 h-6" />
          </button>

          {/* 移动工具按钮 */}
          <button
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-lg ${
              isDragging
                ? 'bg-green-500 text-white shadow-green-500/25'
                : 'bg-white/90 backdrop-blur-md text-gray-700 hover:bg-white shadow-black/10'
            }`}
            onClick={() => {
              setShowTextPanel(false);
              setShowRoutePanel(false);
            }}
          >
            <Move className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* 文字样式面板 */}
      {showTextPanel && (
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 w-80 max-w-[calc(100vw-2rem)] z-30">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-6 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Type className="w-5 h-5 mr-2 text-blue-500" />
                文字样式
              </h3>
              <button
                onClick={() => setShowTextPanel(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                <span className="text-gray-600 text-sm">✕</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">字体大小</label>
                  <span className="text-sm text-gray-500">{textStyle.fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="48"
                  value={textStyle.fontSize}
                  onChange={(e) => setTextStyle(prev => ({ ...prev, fontSize: parseInt(e.target.value) }))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">颜色</label>
                <div className="flex items-center space-x-3">
                  <input
                    type="color"
                    value={textStyle.color}
                    onChange={(e) => setTextStyle(prev => ({ ...prev, color: e.target.value }))}
                    className="w-12 h-12 rounded-xl border-2 border-gray-200 cursor-pointer"
                  />
                  <div className="flex space-x-2">
                    {['#FFFFFF', '#000000', '#FF3B30', '#007AFF', '#34C759', '#FF9500'].map(color => (
                      <button
                        key={color}
                        onClick={() => setTextStyle(prev => ({ ...prev, color }))}
                        className="w-8 h-8 rounded-lg border-2 border-gray-200 transition-transform hover:scale-110"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 rounded-xl p-3">
                <div className="flex items-start space-x-2">
                  <Move className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">拖拽调整位置</p>
                    <p className="text-xs opacity-90">在画布上直接点击并拖拽文字来调整位置</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 路线样式面板 */}
      {showRoutePanel && (
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 w-80 max-w-[calc(100vw-2rem)] z-30">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-6 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Route className="w-5 h-5 mr-2 text-red-500" />
                路线样式
              </h3>
              <button
                onClick={() => setShowRoutePanel(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                <span className="text-gray-600 text-sm">✕</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">线宽</label>
                  <span className="text-sm text-gray-500">{routeStyle.width}px</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="8"
                  value={routeStyle.width}
                  onChange={(e) => setRouteStyle(prev => ({ ...prev, width: parseInt(e.target.value) }))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">颜色</label>
                <div className="flex items-center space-x-3">
                  <input
                    type="color"
                    value={routeStyle.color}
                    onChange={(e) => setRouteStyle(prev => ({ ...prev, color: e.target.value }))}
                    className="w-12 h-12 rounded-xl border-2 border-gray-200 cursor-pointer"
                  />
                  <div className="flex space-x-2">
                    {['#FF3B30', '#007AFF', '#34C759', '#FF9500', '#AF52DE', '#5AC8FA'].map(color => (
                      <button
                        key={color}
                        onClick={() => setRouteStyle(prev => ({ ...prev, color }))}
                        className="w-8 h-8 rounded-lg border-2 border-gray-200 transition-transform hover:scale-110"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">透明度</label>
                  <span className="text-sm text-gray-500">{Math.round(routeStyle.opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={routeStyle.opacity}
                  onChange={(e) => setRouteStyle(prev => ({ ...prev, opacity: parseFloat(e.target.value) }))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
              </div>

              <div className="bg-red-50 rounded-xl p-3">
                <div className="flex items-start space-x-2">
                  <Move className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-red-800">
                    <p className="font-medium mb-1">拖拽调整位置</p>
                    <p className="text-xs opacity-90">在画布上直接点击并拖拽路线来调整位置</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 背景遮罩 */}
      {(showTextPanel || showRoutePanel) && (
        <div
          className="fixed inset-0 bg-black/20 z-20"
          onClick={() => {
            setShowTextPanel(false);
            setShowRoutePanel(false);
          }}
        />
      )}

      {/* 自定义滑块样式 */}
      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #007AFF;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 122, 255, 0.3);
        }
        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #007AFF;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 6px rgba(0, 122, 255, 0.3);
        }
        .animate-in {
          animation: slideInFromBottom 0.3s ease-out;
        }
        @keyframes slideInFromBottom {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );

  // 主渲染
  return (
    <div className="font-sans">
      {currentPage === 'upload' && renderUploadPage()}
      {currentPage === 'activities' && renderActivitiesPage()}
      {currentPage === 'editor' && renderEditorPage()}
    </div>
  );
};

export default GarminOverlayApp;