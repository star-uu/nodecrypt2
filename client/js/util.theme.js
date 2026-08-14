// Theme utility functions
// 主题工具函数

// Theme data — Telegram-style tiled pattern wallpapers.
// Each `background` is a full CSS background shorthand: pattern layer(s)
// on top of a soft base gradient, tiled at their natural size.
// 主题数据 — Telegram 风格平铺图案壁纸。
// 每个 `background` 是完整 CSS background 简写：图案层叠加在柔和底渐变上，
// 按原始尺寸平铺（不再是拉伸模糊的色块）。
export const THEMES = [
	{
		id: 'theme1',
		// 淡蓝底 + 白色圆点 / soft blue + white dots
		background: 'radial-gradient(circle at 10px 10px, rgba(255,255,255,0.6) 2px, transparent 2.8px) 0 0 / 20px 20px, linear-gradient(135deg, #dbeafe 0%, #c2d7ff 60%, #b3c9fc 100%)'
	},
	{
		id: 'theme2',
		// 浅绿底 + 细密圆点 / soft green + fine dots
		background: 'radial-gradient(circle at 8px 8px, rgba(255,255,255,0.55) 1.6px, transparent 2.3px) 0 0 / 16px 16px, linear-gradient(160deg, #dcfce7 0%, #bdf0d0 100%)'
	},
	{
		id: 'theme3',
		// 奶油黄底 + 斜纹 / cream + diagonal stripes
		background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.5) 0 6px, transparent 6px 12px) 0 0, linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)'
	},
	{
		id: 'theme4',
		// 淡紫底 + 细网格 / soft purple + grid
		background: 'linear-gradient(rgba(255,255,255,0.42) 1px, transparent 1px) 0 0 / 24px 24px, linear-gradient(90deg, rgba(255,255,255,0.42) 1px, transparent 1px) 0 0 / 24px 24px, linear-gradient(135deg, #ede9fe 0%, #d8d0fc 100%)'
	},
	{
		id: 'theme5',
		// 粉底 + 波浪 / pink + waves
		background: 'radial-gradient(circle at 0 0, transparent 14px, rgba(255,255,255,0.5) 14.5px, transparent 15.5px) 0 0 / 28px 28px, linear-gradient(135deg, #fce7f3 0%, #f9c3e0 100%)'
	},
	{
		id: 'theme6',
		// 天蓝底 + 棋盘 / sky + checker
		background: 'conic-gradient(rgba(255,255,255,0.35) 90deg, transparent 90deg 180deg, rgba(255,255,255,0.35) 180deg 270deg, transparent 270deg) 0 0 / 32px 32px, linear-gradient(150deg, #e0f2fe 0%, #b3defd 100%)'
	},
	{
		id: 'theme7',
		// 石墨底 + 亮点 / graphite + light dots
		background: 'radial-gradient(circle at 10px 10px, rgba(255,255,255,0.28) 1.5px, transparent 2.2px) 0 0 / 18px 18px, linear-gradient(145deg, #475569 0%, #334155 100%)'
	},
	{
		id: 'theme8',
		// 深夜蓝底 + 星点 / deep navy + stars
		background: 'radial-gradient(circle at 12px 12px, rgba(255,255,255,0.22) 1.4px, transparent 2px) 0 0 / 22px 22px, radial-gradient(circle at 0 0, rgba(255,255,255,0.15) 1.2px, transparent 1.8px) 6px 6px / 22px 22px, linear-gradient(150deg, #1e293b 0%, #0f172a 100%)'
	}
];

// Get current theme from settings
// 从设置中获取当前主题
export function getCurrentTheme() {
    try {
        const settings = JSON.parse(localStorage.getItem('settings') || '{}');
        
        // If no theme is set (first-time visitor), use theme1 as default
        // 如果没有设置主题（首次访问），使用 theme1 作为默认
        if (!settings.theme) {
            // Save theme1 as default theme to settings
            // 将 theme1 作为默认主题保存到设置中
            settings.theme = 'theme1';
            localStorage.setItem('settings', JSON.stringify(settings));
            
            return THEMES[0];
        }
        
        const themeId = settings.theme;
        return THEMES.find(theme => theme.id === themeId) || THEMES[0];
    } catch {
        // If there's an error, use theme1 as fallback
        // 如果出现错误，使用 theme1 作为备选
        return THEMES[0];
    }
}

// Apply theme to the document
// 应用主题到文档
export function applyTheme(themeId) {
	const theme = THEMES.find(t => t.id === themeId);
	if (!theme) {
		console.warn(`Theme with id "${themeId}" not found`);
		return false;
	}
	
	const mainElement = document.querySelector('.main');
	if (mainElement) {
		// Full shorthand: pattern layers tile at their natural size over the
		// base gradient (Telegram-style wallpapers)
		// 完整简写：图案层按原始尺寸平铺在底渐变上（Telegram 风格壁纸）
		mainElement.style.background = theme.background;
		// Add transition effect for smooth theme switching
		// 添加过渡效果，实现平滑的主题切换
		mainElement.style.transition = 'background 0.5s ease-in-out';
		
		return true;
	} else {
		console.warn('Main element not found');
		return false;
	}
}

// Initialize theme on page load
// 页面加载时初始化主题
export function initTheme() {
	const currentTheme = getCurrentTheme();
	applyTheme(currentTheme.id);
}

// Get theme by ID
// 根据ID获取主题
export function getThemeById(themeId) {
	return THEMES.find(theme => theme.id === themeId);
}

// Get all available themes
// 获取所有可用主题
export function getAllThemes() {
	return THEMES;
}
