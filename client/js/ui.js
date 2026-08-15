// UI logic for NodeCrypt web client
// NodeCrypt 网页客户端的 UI 逻辑

import {
	createAvatarSVG
} from './util.avatar.js';
import {
	roomsData,
	activeRoomIndex,
	togglePrivateChat,
	exitRoom
} from './room.js';
import {
	escapeHTML
} from './util.string.js';
import {
	$id
} from './util.dom.js';
import {
	closeSettingsPanel
} from './util.settings.js';
import {
	t
} from './util.i18n.js';
import {
	updateChatInputStyle
} from './chat.js';
import {
	callManager
} from './util.call.js';

// Utility functions for security and error handling
// 安全和错误处理工具函数

// Simple encryption/decryption using base64 and character shifting
// 使用base64和字符偏移的简单加密/解密
function simpleEncrypt(text) {
	if (!text) return '';
	// Convert to base64 and shift characters
	const base64 = btoa(unescape(encodeURIComponent(text)));
	return base64.split('').map(char => {
		const code = char.charCodeAt(0);
		return String.fromCharCode(code + 3);
	}).join('');
}

function simpleDecrypt(encrypted) {
	if (!encrypted) return '';
	try {
		// Reverse character shifting and decode base64
		const shifted = encrypted.split('').map(char => {
			const code = char.charCodeAt(0);
			return String.fromCharCode(code - 3);
		}).join('');
		return decodeURIComponent(escape(atob(shifted)));
	} catch (error) {
		console.warn('Failed to decrypt data:', error);
		return '';
	}
}

// Validate room data
// 验证房间数据
function validateRoomData(roomData) {
	if (!roomData) {
		return { valid: false, error: 'No room data available' };
	}
	if (!roomData.roomName || roomData.roomName.trim() === '') {
		return { valid: false, error: 'Room name is required' };
	}
	return { valid: true };
}

// Copy text to clipboard with fallback
// 复制文本到剪贴板（含降级处理）
function copyToClipboard(text, successMessage = t('action.copied', 'Copied to clipboard!'), errorPrefix = t('action.copy_failed', 'Copy failed, url:')) {
	if (!text) {
		window.addSystemMsg && window.addSystemMsg(t('action.nothing_to_copy', 'Nothing to copy'));
		return;
	}

	if (navigator.clipboard && navigator.clipboard.writeText) {
		navigator.clipboard.writeText(text).then(() => {
			window.addSystemMsg && window.addSystemMsg(successMessage);
		}).catch((error) => {
			console.error('Clipboard write failed:', error);
			showFallbackCopy(text, errorPrefix);
		});
	} else {
		showFallbackCopy(text, errorPrefix);
	}
}

// Show fallback copy method
// 显示降级复制方法
function showFallbackCopy(text, prefix) {
	if (typeof prompt === 'function') {
		prompt(prefix, text);
	} else {
		// For environments where prompt is not available
		window.addSystemMsg && window.addSystemMsg(t('action.copy_not_supported', 'Copy not supported in this environment'));
	}
}

// Execute menu action with error handling
// 执行菜单操作并处理错误
function executeMenuAction(action, closeMenuCallback) {
	try {
		switch (action) {
			case 'share':
				handleShareAction();
				break;
			case 'exit':
				handleExitAction();
				break;
			default:
				console.warn('Unknown menu action:', action);
		}
	} catch (error) {
		console.error('Menu action failed:', error);
		window.addSystemMsg && window.addSystemMsg(t('action.action_failed', 'Action failed. Please try again.'));
	} finally {
		closeMenuCallback && closeMenuCallback();
	}
}

// Handle share action
// 处理分享操作
function handleShareAction() {
	const validation = validateRoomData(roomsData[activeRoomIndex]);
	if (!validation.valid) {
		window.addSystemMsg && window.addSystemMsg(`${t('action.cannot_share', 'Cannot share:')} ${validation.error}`);
		return;
	}

	const rd = roomsData[activeRoomIndex];
	const roomName = rd.roomName.trim();
	const password = rd.password || '';
	
	// Encrypt room name and password
	const encryptedRoom = simpleEncrypt(roomName);
	const encryptedPwd = password ? simpleEncrypt(password) : '';
	
	// Create share URL with encrypted data
	let url = `${location.origin}${location.pathname}?r=${encodeURIComponent(encryptedRoom)}`;
	if (encryptedPwd) {
		url += `&p=${encodeURIComponent(encryptedPwd)}`;
	}
	
	copyToClipboard(url, t('action.share_copied', 'Share link copied!'), t('action.copy_url_failed', 'Copy failed, url:'));
	// 提醒：链接包含房间与密码信息，谁拿到链接就能进入房间
	// Reminder: the link carries the room credentials — anyone with it can join
	window.addSystemMsg && window.addSystemMsg(t('system.share_link_warning', '⚠️ Anyone with this link can join the room — share it only with trusted people.'), true);
}

// Handle exit action
// 处理退出操作
function handleExitAction() {
	try {
		const result = exitRoom();
		if (!result) {
			location.reload();
		}
	} catch (error) {
		console.error('Exit room failed:', error);
		// Force reload as fallback
		location.reload();
	}
}

// Render the main header
// 渲染主标题栏
export function renderMainHeader() {
	const rd = roomsData[activeRoomIndex];
	let roomName = rd ? rd.roomName : 'Room';
	let onlineCount = rd && rd.userList ? rd.userList.length : 0;
	if (rd && !rd.userList.some(u => u.clientId === rd.myId)) {
		onlineCount += 1
	}
	const safeRoomName = escapeHTML(roomName);
	$id("main-header").innerHTML = `<button class="mobile-menu-btn"id="mobile-menu-btn"aria-label="Open Sidebar"><svg width="35px"height="35px"viewBox="0 0 24 24"fill="none"xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier"stroke-width="0"></g><g id="SVGRepo_tracerCarrier"stroke-linecap="round"stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill-rule="evenodd"clip-rule="evenodd"d="M21.4498 10.275L11.9998 3.1875L2.5498 10.275L2.9998 11.625H3.7498V20.25H20.2498V11.625H20.9998L21.4498 10.275ZM5.2498 18.75V10.125L11.9998 5.0625L18.7498 10.125V18.75H14.9999V14.3333L14.2499 13.5833H9.74988L8.99988 14.3333V18.75H5.2498ZM10.4999 18.75H13.4999V15.0833H10.4999V18.75Z"fill="#808080"></path></g></svg></button><div class="main-header-center"id="main-header-center"><div class="main-header-flex"><div class="group-title group-title-bold">#${safeRoomName}</div><span class="main-header-members">${onlineCount} ${t('ui.members', 'members')}</span></div></div><div class="main-header-actions"><button class="more-btn"id="more-btn"aria-label="More Options"><svg width="30px"height="30px"viewBox="0 0 24 24"fill="none"xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier"stroke-width="0"></g><g id="SVGRepo_tracerCarrier"stroke-linecap="round"stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><circle cx="12"cy="6"r="1.5"fill="#808080"></circle><circle cx="12"cy="12"r="1.5"fill="#808080"></circle><circle cx="12"cy="18"r="1.5"fill="#808080"></circle></g></svg></button><button class="mobile-info-btn"id="mobile-info-btn"aria-label="Open Members"><svg width="35px"height="35px"viewBox="0 0 24 24"fill="none"xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier"stroke-width="0"></g><g id="SVGRepo_tracerCarrier"stroke-linecap="round"stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill-rule="evenodd"clip-rule="evenodd"d="M16.0603 18.307C14.89 19.0619 13.4962 19.5 12 19.5C10.5038 19.5 9.10996 19.0619 7.93972 18.307C8.66519 16.7938 10.2115 15.75 12 15.75C13.7886 15.75 15.3349 16.794 16.0603 18.307ZM17.2545 17.3516C16.2326 15.5027 14.2632 14.25 12 14.25C9.73663 14.25 7.76733 15.5029 6.74545 17.3516C5.3596 15.9907 4.5 14.0958 4.5 12C4.5 7.85786 7.85786 4.5 12 4.5C16.1421 4.5 19.5 7.85786 19.5 12C19.5 14.0958 18.6404 15.9908 17.2545 17.3516ZM21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12ZM12 12C13.2426 12 14.25 10.9926 14.25 9.75C14.25 8.50736 13.2426 7.5 12 7.5C10.7574 7.5 9.75 8.50736 9.75 9.75C9.75 10.9926 10.7574 12 12 12ZM12 13.5C14.0711 13.5 15.75 11.8211 15.75 9.75C15.75 7.67893 14.0711 6 12 6C9.92893 6 8.25 7.67893 8.25 9.75C8.25 11.8211 9.92893 13.5 12 13.5Z"fill="#808080"></path></g></svg></button><div class="more-menu"id="more-menu"><div class="more-menu-item"data-action="share">${t('action.share', 'Share')}</div><div class="more-menu-item"data-action="exit">${t('action.exit', 'Quit')}</div></div></div>`;
	setupMoreBtnMenu();
	setupMobileUIHandlers()
}

// Update only the online-members count text without rebuilding the header
// 只更新在线人数文字，不重建整个头部（避免成员变动时整块重绘）
export function updateMembersCount() {
	const el = document.querySelector('.main-header-members');
	if (!el) return;
	const rd = roomsData[activeRoomIndex];
	let onlineCount = rd && rd.userList ? rd.userList.length : 0;
	if (rd && !rd.userList.some(u => u.clientId === rd.myId)) {
		onlineCount += 1
	}
	el.textContent = `${onlineCount} ${t('ui.members', 'members')}`
}

// Setup mobile UI event handlers
// 设置移动端 UI 事件处理
let mobileUIInitialized = false;

export function setupMobileUIHandlers() {
	const getEls = () => ({
		sidebar: document.getElementById('sidebar'),
		rightbar: document.getElementById('rightbar'),
		settingsSidebar: document.getElementById('settings-sidebar'),
		mobileMenuBtn: document.getElementById('mobile-menu-btn'),
		mobileInfoBtn: document.getElementById('mobile-info-btn'),
		sidebarMask: document.getElementById('mobile-sidebar-mask'),
		rightbarMask: document.getElementById('mobile-rightbar-mask')
	});

	function isMobile() {
		return window.innerWidth <= 900
	}

	function updateMobileBtnDisplay() {
		const els = getEls();
		if (isMobile()) {
			if (els.mobileMenuBtn) els.mobileMenuBtn.style.display = 'flex';
			if (els.mobileInfoBtn) els.mobileInfoBtn.style.display = 'flex'
		} else {
			if (els.mobileMenuBtn) els.mobileMenuBtn.style.display = 'none';
			if (els.mobileInfoBtn) els.mobileInfoBtn.style.display = 'none';
			if (els.sidebar) els.sidebar.classList.remove('mobile-open');
			if (els.rightbar) els.rightbar.classList.remove('mobile-open');
			if (els.sidebarMask) els.sidebarMask.classList.remove('active');
			if (els.rightbarMask) els.rightbarMask.classList.remove('active')
		}
	}
	updateMobileBtnDisplay();

	const els = getEls();
	if (els.mobileMenuBtn && els.sidebar && els.sidebarMask) {
		els.mobileMenuBtn.onclick = function(e) {
			e.stopPropagation();
			els.sidebar.classList.add('mobile-open');
			els.sidebarMask.classList.add('active')
		};
		els.sidebarMask.onclick = function() {
			if (els.settingsSidebar && els.settingsSidebar.classList.contains('mobile-open')) {
				closeSettingsPanel();
			} else {
				els.sidebar.classList.remove('mobile-open');
				els.sidebarMask.classList.remove('active');
			}
		}
	}
	if (els.mobileInfoBtn && els.rightbar && els.rightbarMask) {
		els.mobileInfoBtn.onclick = function(e) {
			e.stopPropagation();
			els.rightbar.classList.add('mobile-open');
			els.rightbarMask.classList.add('active')
		};
		els.rightbarMask.onclick = function() {
			els.rightbar.classList.remove('mobile-open');
			els.rightbarMask.classList.remove('active')
		}
	}

	if (!mobileUIInitialized) {
		window.addEventListener('resize', updateMobileBtnDisplay);

		let touchStartX = 0;
		let touchStartY = 0;
		let edgeSwipeTarget = null;

		document.addEventListener('touchstart', (ev) => {
			const touch = ev.touches[0];
			if (!touch) return;
			touchStartX = touch.clientX;
			touchStartY = touch.clientY;
			edgeSwipeTarget = null;
		}, { passive: true });

		document.addEventListener('touchmove', (ev) => {
			const touch = ev.touches[0];
			if (!touch) return;
			const dx = touch.clientX - touchStartX;
			const dy = touch.clientY - touchStartY;
			if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;

			const els = getEls();
			if (touchStartX <= 32 && dx > 0 && els.sidebar && !els.sidebar.classList.contains('mobile-open')) {
				ev.preventDefault();
				edgeSwipeTarget = 'sidebar';
			} else if (touchStartX >= window.innerWidth - 32 && dx < 0 && els.rightbar && !els.rightbar.classList.contains('mobile-open')) {
				ev.preventDefault();
				edgeSwipeTarget = 'rightbar';
			}
		}, { passive: false });

		document.addEventListener('touchend', () => {
			const els = getEls();
			if (edgeSwipeTarget === 'sidebar' && els.sidebar) {
				els.sidebar.classList.add('mobile-open');
				if (els.sidebarMask) els.sidebarMask.classList.add('active');
			} else if (edgeSwipeTarget === 'rightbar' && els.rightbar) {
				els.rightbar.classList.add('mobile-open');
				if (els.rightbarMask) els.rightbarMask.classList.add('active');
			}
			edgeSwipeTarget = null;
		});

		document.addEventListener('click', function(ev) {
			const current = getEls();
			const settingsBtn = $id('settings-btn');
			const isSettingsButtonClick = settingsBtn && settingsBtn.contains(ev.target);
			const settingsBackBtn = $id('settings-back-btn');
			const isSettingsBackButtonClick = settingsBackBtn && settingsBackBtn.contains(ev.target);

			if (current.settingsSidebar && (current.settingsSidebar.classList.contains('open') || current.settingsSidebar.classList.contains('mobile-open'))) {
				if (!current.settingsSidebar.contains(ev.target) && !isSettingsButtonClick && !isSettingsBackButtonClick) {
					closeSettingsPanel();
				}
			}

			if (isMobile()) {
				if (current.sidebar && current.sidebar.classList.contains('mobile-open')) {
					if (!current.sidebar.contains(ev.target) && ev.target !== current.mobileMenuBtn) {
						current.sidebar.classList.remove('mobile-open');
						if (current.sidebarMask) current.sidebarMask.classList.remove('active');
					}
				}
				if (current.settingsSidebar && current.settingsSidebar.classList.contains('mobile-open')) {
					const isSettingsButton = settingsBtn && settingsBtn.contains(ev.target);
					if (!current.settingsSidebar.contains(ev.target) && !isSettingsButton) {
						closeSettingsPanel();
					}
				}
				if (current.rightbar && current.rightbar.classList.contains('mobile-open')) {
					if (!current.rightbar.contains(ev.target) && ev.target !== current.mobileInfoBtn) {
						current.rightbar.classList.remove('mobile-open');
						if (current.rightbarMask) current.rightbarMask.classList.remove('active');
					}
				}
			} else {
				if (current.settingsSidebar && current.settingsSidebar.classList.contains('open')) {
					const isSettingsButton = settingsBtn && settingsBtn.contains(ev.target);
					if (!current.settingsSidebar.contains(ev.target) && !isSettingsButton) {
						closeSettingsPanel();
					}
				}
			}
		});

		mobileUIInitialized = true;
	}
}

// Render the user/member list
// 渲染用户/成员列表
export function renderUserList(updateHeader = false) {
	const userListEl = $id('member-list');
	if (!userListEl) return;
	userListEl.innerHTML = '';
	const rd = roomsData[activeRoomIndex];
	if (!rd) return;
	const me = rd.userList.find(u => u.clientId === rd.myId);
	const others = rd.userList.filter(u => u.clientId !== rd.myId);
	// 新增：如有其他成员，顶部插入简洁提示
	if (others.length > 0) {
		const tip = document.createElement('div');
		tip.className = 'member-tip member-tip-center';
		tip.textContent = t('ui.start_private_chat', '选择用户开始私信');
		userListEl.appendChild(tip);
	}
	if (me) userListEl.appendChild(createUserItem(me, true));
	others.forEach(u => userListEl.appendChild(createUserItem(u, false)));
	if (updateHeader) {
		renderMainHeader()
	}
}

// Create a user list item
// 创建一个用户列表项
export function createUserItem(user, isMe) {
	const div = document.createElement('div');
	const rd = roomsData[activeRoomIndex];
	const isPrivateTarget = rd && user.clientId === rd.privateChatTargetId;
	div.className = 'member' + (isMe ? ' me' : '') + (isPrivateTarget ? ' private-chat-active' : '');
	const rawName = user.userName || user.username || user.name || '';
	const safeUserName = escapeHTML(rawName);
	div.innerHTML = `<span class="avatar"></span><div class="member-info"><div class="member-name">${safeUserName}${isMe?t('ui.me', ' (me)'):''}</div></div>`;
	const avatarEl = div.querySelector('.avatar');
	if (avatarEl) {
		const svg = createAvatarSVG(rawName);
		const cleanSvg = svg.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
		avatarEl.innerHTML = cleanSvg
	}
	if (!isMe) {
		div.onclick = () => togglePrivateChat(user.clientId, safeUserName)
		div.setAttribute('role', 'button');
		div.setAttribute('tabindex', '0');
		div.setAttribute('aria-label', `${t('ui.start_private_chat', 'Start private chat with')} ${safeUserName}`);
		div.onkeydown = (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				togglePrivateChat(user.clientId, safeUserName);
			}
		};
		// Add a voice call button (stops propagation so private chat is not toggled)
		// 添加语音通话按钮（阻止冒泡，避免触发私聊切换）
		const callBtn = document.createElement('button');
		callBtn.className = 'member-call-btn';
		callBtn.type = 'button';
		callBtn.title = t('call.start_voice_call', 'Start voice call');
		callBtn.setAttribute('aria-label', t('call.start_voice_call', 'Start voice call'));
		callBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
		</svg>`;
		callBtn.onclick = (e) => {
			e.stopPropagation();
			callManager.startCall(user.clientId, rawName);
		};
		div.appendChild(callBtn);

		// Add a video call button
		// 添加视频通话按钮
		const videoBtn = document.createElement('button');
		videoBtn.className = 'member-call-btn video';
		videoBtn.type = 'button';
		videoBtn.title = t('call.start_video_call', 'Start video call');
		videoBtn.setAttribute('aria-label', t('call.start_video_call', 'Start video call'));
		videoBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M23 7l-7 5 7 5V7z"></path>
			<rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
		</svg>`;
		videoBtn.onclick = (e) => {
			e.stopPropagation();
			callManager.startVideoCall(user.clientId, rawName);
		};
		div.appendChild(videoBtn);
	}
	return div
}

// Setup the 'more' button menu
// 设置"更多"按钮菜单
let moreMenuDocumentBound = false;

export function setupMoreBtnMenu() {
	const btn = $id('more-btn');
	let menu = $id('more-menu');
	if (!btn) return;

	// The menu is created on demand (the header template does not render it)
	// 菜单按需创建（头部模板不渲染它）
	if (!menu) {
		menu = document.createElement('div');
		menu.id = 'more-menu';
		menu.className = 'more-menu';
		menu.innerHTML = `
			<div class="more-menu-item" data-action="share" role="button" tabindex="0">${t('action.share', 'Share')}</div>
			<div class="more-menu-item" data-action="exit" role="button" tabindex="0">${t('action.exit', 'Exit')}</div>
		`;
		btn.parentNode.appendChild(menu);
	}

	function openMenu() {
		menu.style.display = 'block';
		menu.classList.remove('close');
		// 强制触发重绘，然后添加打开动画
		menu.offsetHeight; // 强制重绘
		menu.classList.add('open');
	}

	function closeMenu() {
		menu.classList.remove('open');
		menu.classList.add('close');
		setTimeout(() => {
			if (menu.classList.contains('close')) menu.style.display = 'none';
		}, 300);
	}

	btn.onclick = function(e) {
		e.stopPropagation();
		if (menu.classList.contains('open')) {
			closeMenu();
		} else {
			openMenu();
		}
	};

	menu.onclick = function(e) {
		const item = e.target.closest('.more-menu-item');
		if (item) {
			const action = item.dataset.action;
			executeMenuAction(action, closeMenu);
		}
	};

	// Keyboard support for menu items
	// 菜单项键盘支持
	menu.onkeydown = function(e) {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		const item = e.target.closest('.more-menu-item');
		if (item) {
			e.preventDefault();
			executeMenuAction(item.dataset.action, closeMenu);
		}
	};

	if (!moreMenuDocumentBound) {
		document.addEventListener('click', function(ev) {
			const currentBtn = $id('more-btn');
			const currentMenu = $id('more-menu');
			if (!currentMenu) return;
			if (!currentMenu.contains(ev.target) && ev.target !== currentBtn) {
				currentMenu.classList.remove('open');
				currentMenu.classList.add('close');
				setTimeout(() => {
					if (currentMenu.classList.contains('close')) currentMenu.style.display = 'none';
				}, 300);
			}
		});
		moreMenuDocumentBound = true;
	}
}

// Prevent space and special character input
// 禁止输入空格和特殊字符
export function preventSpaceInput(input) {
	if (!input) return;
	input.addEventListener('keydown', function(e) {
		if (e.key === ' ' || (/[\u0000-\u007f]/.test(e.key) && /[\p{P}\p{S}]/u.test(e.key) && e.key !== "'")) {
			e.preventDefault()
		}
	});
	input.addEventListener('input', function(e) {
		input.value = input.value.replace(/[\s\p{P}\p{S}]/gu, function(match) {
			return match === "'" ? "'" : ''
		})
	})
}

// Show/clear validation error state on a room input
// 显示/清除房间输入框的校验错误状态
function showInputError(input, message) {
	if (!input) return;
	clearInputError(input);
	input.classList.add('input-error');
	const warnTip = document.createElement('div');
	warnTip.className = 'input-error-tip';
	warnTip.textContent = message;
	input.parentNode.appendChild(warnTip);
	input._warnTip = warnTip;
}

function clearInputError(input) {
	if (!input) return;
	input.classList.remove('input-error');
	if (input._warnTip) {
		input.parentNode.removeChild(input._warnTip);
		input._warnTip = null;
	}
}

// Login form submit handler
// 登录表单提交处理函数
export function loginFormHandler(modal) {
	return function(e) {
		e.preventDefault();
		let userName, roomName, password, btn, roomInput, formEl;
		if (modal) {
			userName = document.getElementById('userName-modal').value.trim();
			roomName = document.getElementById('roomName-modal').value.trim();
			password = document.getElementById('password-modal').value; // 密码不 trim，允许空格等字符 / Password untrimmed
			btn = modal.querySelector('.login-btn');
			roomInput = document.getElementById('roomName-modal');
			formEl = modal.querySelector('form');
		} else {
			userName = document.getElementById('userName').value.trim();
			roomName = document.getElementById('roomName').value.trim();
			password = document.getElementById('password').value; // 密码不 trim，允许空格等字符 / Password untrimmed
			btn = document.querySelector('#login-form .login-btn');
			roomInput = document.getElementById('roomName');
			formEl = document.getElementById('login-form');
		}
		// 邀请模式下房间号是隐藏字段，错误信息显示在表单的错误槽里
		// In invite mode the room input is hidden: show errors in the form error slot
		const errorSlot = formEl ? formEl.querySelector('.form-error-slot') : null;
		const clearError = () => {
			if (errorSlot) errorSlot.textContent = '';
			clearInputError(roomInput);
		};
		const showError = (message) => {
			if (errorSlot) {
				errorSlot.textContent = message;
			} else {
				showInputError(roomInput, message);
			}
		};
		const exists = roomsData.some(rd => rd.roomName && rd.roomName.toLowerCase() === roomName.toLowerCase());
		clearError();
		if (exists) {
			showError(t('ui.node_exists', 'Room already exists'));
			if (roomInput && roomInput.type !== 'hidden') roomInput.focus();
			if (btn) {
				btn.disabled = false;
				btn.innerText = t('ui.enter', 'ENTER')
			}
			return
		}
		if (btn) {
			btn.disabled = true;
			btn.innerText = t('ui.connecting', 'Connecting...')
		}
		window.joinRoom(userName, roomName, password, modal, function(success) {
			if (!success && btn) {
				btn.disabled = false;
				btn.innerText = t('ui.enter', 'ENTER');
				showError(t('ui.connect_failed', 'Connection failed, please try again'));
			}
		})
	}
}

// 生成登录表单HTML
// Generate login form HTML
export function generateLoginForm(isModal = false) {
	const idPrefix = isModal ? '-modal' : '';
	return `		<div class="input-group">
			<input id="userName${idPrefix}" type="text" autocomplete="username" required minlength="1" maxlength="15" placeholder="">
			<label for="userName${idPrefix}" class="floating-label">${t('ui.username', 'Username')}</label>
		</div>
		<div class="input-group">
			<input id="roomName${idPrefix}" type="text" required minlength="1" maxlength="15" placeholder="">
			<label for="roomName${idPrefix}" class="floating-label">${t('ui.node_name', 'Room Name')}</label>
		</div>
		<div class="input-group">
			<input id="password${idPrefix}" type="password" autocomplete="${isModal ? 'off' : 'current-password'}" minlength="1" maxlength="64" placeholder="">
			<label for="password${idPrefix}" class="floating-label">${t('ui.node_password', 'Room Password')} <span class="optional">${t('ui.optional', '(optional)')}</span></label>
		</div>
		<button type="submit" class="login-btn">${t('ui.enter', 'ENTER')}</button>
	`;
}
export function openLoginModal() {
	const modal = document.createElement('div');
	modal.className = 'login-modal';
	modal.innerHTML = `<div class="login-modal-bg"></div><div class="login-modal-card"><button class="login-modal-close login-modal-close-abs">&times;</button><h1>${t('ui.enter_node', 'Enter a Room')}</h1><form id="login-form-modal">${generateLoginForm(true)}</form></div>`;
	document.body.appendChild(modal);
	modal.querySelector('.login-modal-close').onclick = () => modal.remove();
	preventSpaceInput(modal.querySelector('#userName-modal'));
	preventSpaceInput(modal.querySelector('#roomName-modal'));
	// 密码允许任意字符，不做空格过滤
	// Password accepts any characters — no filtering
	const form = modal.querySelector('#login-form-modal');
	form.addEventListener('submit', loginFormHandler(modal));
	autofillRoomPwd('-modal')
}

// Autofill room and password from URL
// 从 URL 自动填充房间和密码
export function autofillRoomPwd(formPrefix = '') {
	const params = new URLSearchParams(window.location.search);
	
	// Check for new encrypted format first
	const encryptedRoom = params.get('r');
	const encryptedPwd = params.get('p');
	
	// Check for old plaintext format (for backward compatibility)
	const plaintextRoom = params.get('node');
	const plaintextPwd = params.get('pwd');
	
	let roomValue = '';
	let pwdValue = '';
	let isPlaintext = false;
	
	if (encryptedRoom) {
		// New encrypted format
		roomValue = simpleDecrypt(decodeURIComponent(encryptedRoom));
		if (encryptedPwd) {
			pwdValue = simpleDecrypt(decodeURIComponent(encryptedPwd));
		}
	} else if (plaintextRoom) {
		// Old plaintext format - show security warning
		roomValue = decodeURIComponent(plaintextRoom);
		if (plaintextPwd) {
			pwdValue = decodeURIComponent(plaintextPwd);
		}
		isPlaintext = true;
		
		// Show security warning for plaintext URLs
		if (window.addSystemMsg) {
			window.addSystemMsg(t('system.security_warning', '⚠️ This link uses an old format. Room data is not encrypted.'), true);
		}
	}
	// Fill in the form fields
	if (roomValue) {
		const roomInput = document.getElementById(formPrefix + 'roomName');
		if (roomInput) {
			roomInput.value = roomValue;
			roomInput.readOnly = true;
			roomInput.classList.remove('autofilled', 'autofilled-plain');
			roomInput.classList.add(isPlaintext ? 'autofilled-plain' : 'autofilled');
		}
		// Always lock password field when coming from a share link
		const pwdInput = document.getElementById(formPrefix + 'password');
		if (pwdInput) {
			pwdInput.value = pwdValue; // Will be empty string if no password
			pwdInput.readOnly = true;
			pwdInput.classList.remove('autofilled', 'autofilled-plain');
			pwdInput.classList.add(isPlaintext ? 'autofilled-plain' : 'autofilled');

			// Add visual indicator for no password and keep label floating
			if (!pwdValue) {
				pwdInput.placeholder = t('file.no_password_required', 'No password required');
				// Add a space to make the input appear "filled" so the label stays floating
				pwdInput.value = ' ';
				// Make the text invisible but keep the label floating behavior
				pwdInput.style.color = 'transparent';
			}
		}
	}
	
	// Clear URL parameters for security
	if (roomValue || pwdValue) {
		window.history.replaceState({}, '', location.pathname);
	}
}

// 初始化登录表单
// Parse room/password from a share link (returns null when no invite present)
// 从分享链接解析房间名/密码（无邀请参数时返回 null）
export function parseInviteParams() {
	const params = new URLSearchParams(window.location.search);
	const encryptedRoom = params.get('r');
	const encryptedPwd = params.get('p');
	const plaintextRoom = params.get('node');
	const plaintextPwd = params.get('pwd');
	if (encryptedRoom) {
		return {
			roomValue: simpleDecrypt(decodeURIComponent(encryptedRoom)),
			pwdValue: encryptedPwd ? simpleDecrypt(decodeURIComponent(encryptedPwd)) : '',
			isPlaintext: false
		};
	}
	if (plaintextRoom) {
		return {
			roomValue: decodeURIComponent(plaintextRoom),
			pwdValue: plaintextPwd ? decodeURIComponent(plaintextPwd) : '',
			isPlaintext: true
		};
	}
	return null;
}

// Build the invite-mode login form: room info becomes a read-only summary,
// the user only enters their nickname and presses the big join button.
// 构建邀请模式登录表单：房间信息变成只读摘要，用户只需填写昵称并点击大按钮。
export function initInviteForm() {
	const container = document.getElementById('login-form');
	if (!container) return;
	const invite = parseInviteParams();
	if (!invite) {
		container.innerHTML = generateLoginForm(false);
		return;
	}
	const roomName = invite.roomValue || '';
	const hasPwd = invite.pwdValue !== '';
	let badge = `<span class="invite-badge">${t('ui.invite_no_password', 'No password')}</span>`;
	if (invite.isPlaintext) {
		badge = `<span class="invite-badge warn">${t('ui.invite_old_link', '⚠️ Old format link')}</span>`;
	} else if (hasPwd) {
		badge = `<span class="invite-badge lock">${t('ui.invite_password_filled', '🔒 Password filled')}</span>`;
	}
	container.innerHTML = `
		<div class="invite-summary">
			<div class="invite-room">
				<span class="label">${t('ui.invite_room_label', 'Room')}</span>
				<span class="name">#${escapeHTML(roomName)}</span>
			</div>
			${badge}
		</div>
		<p class="invite-note">${t('ui.invite_note', 'Room info comes from the invite link — just set your nickname')}</p>
		<input type="hidden" id="roomName" value="${escapeHTML(roomName)}">
		<input type="hidden" id="password" value="${escapeHTML(invite.pwdValue)}">
		<div class="input-group">
			<input id="userName" type="text" autocomplete="username" required minlength="1" maxlength="15" placeholder="">
			<label for="userName" class="floating-label">${t('ui.username', 'Username')}</label>
		</div>
		<button type="submit" class="login-btn">${t('ui.join', 'Join')} #${escapeHTML(roomName)}</button>
		<div class="form-error-slot" role="alert"></div>
		<button type="button" class="invite-manual" id="invite-manual">${t('ui.invite_manual', 'Enter room info manually')}</button>
	`;
	const manualBtn = document.getElementById('invite-manual');
	if (manualBtn) {
		manualBtn.onclick = () => {
			window.history.replaceState({}, '', location.pathname);
			container.innerHTML = generateLoginForm(false);
			preventSpaceInput(document.getElementById('userName'));
			preventSpaceInput(document.getElementById('roomName'));
			preventSpaceInput(document.getElementById('password'));
			const u = document.getElementById('userName');
			if (u) u.focus();
		};
	}
	// Auto-focus the only editable field so the next step is obvious
	// 自动聚焦唯一可编辑的昵称框，下一步做什么一目了然
	setTimeout(() => {
		const u = document.getElementById('userName');
		if (u) u.focus();
	}, 60);
}

// Initialize login form
export function initLoginForm() {
	const loginFormContainer = document.getElementById('login-form');
	if (loginFormContainer) {
		if (parseInviteParams()) {
			// Share link: compact invite UI (summary + nickname only)
			// 分享链接：紧凑的邀请界面（摘要 + 仅昵称）
			initInviteForm();
		} else if (loginFormContainer.children.length === 0) {
			// 只有当登录表单为空时才初始化
			// Only initialize if login form is empty
			loginFormContainer.innerHTML = generateLoginForm(false);
		}
	}

	// 普通登录页也自动聚焦用户名，让新用户知道第一步做什么
	// Auto-focus the username field on the normal login page too
	if (!document.querySelector('.invite-summary')) {
		setTimeout(() => {
			const u = document.getElementById('userName');
			if (u && u.type !== 'hidden') u.focus();
		}, 60);
	}

	// 为登录页面添加class，用于手机适配
	// Add class to login page for mobile adaptation
	document.body.classList.add('login-page');
}

// Listen for language change events to refresh UI
// 监听语言变更事件刷新UI
window.addEventListener('languageChange', () => {
	// Refresh main header and user list
	renderMainHeader();
	renderUserList(false);
	
	// Refresh chat input placeholder
	updateChatInputStyle();
});

// Listen for regenerate login form event
// 监听重新生成登录表单事件
window.addEventListener('regenerateLoginForm', () => {
	const loginFormContainer = document.getElementById('login-form');
	if (!loginFormContainer) return;
	if (parseInviteParams()) {
		// Keep the invite UI when switching language
		// 切换语言时保持邀请界面
		initInviteForm();
	} else {
		loginFormContainer.innerHTML = generateLoginForm(false);
	}
});

// 初始化翻转卡片功能
// Initialize flip card functionality
export function initFlipCard() {
	const flipCard = document.getElementById('flip-card');
	const helpBtn = document.getElementById('help-btn');
	const backBtn = document.getElementById('back-btn');
	const helpBackdrop = document.getElementById('help-backdrop');
	
	if (!flipCard || !helpBtn || !backBtn) return;
	
	const flipCardInner = flipCard.querySelector('.flip-card-inner');
	if (!flipCardInner) return;
	
	// 翻转状态
	let isFlipped = false;
	
	// 简单的翻转函数
	function toggleFlip() {
		isFlipped = !isFlipped;
		if (isFlipped) {
			flipCardInner.classList.add('flipped');
			if (helpBackdrop) helpBackdrop.classList.add('active');
		} else {
			flipCardInner.classList.remove('flipped');
			if (helpBackdrop) helpBackdrop.classList.remove('active');
		}
	}
	
	// 帮助按钮点击事件
	helpBtn.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		toggleFlip();
	});
	
	// 返回按钮点击事件
	backBtn.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		toggleFlip();
	});

	if (helpBackdrop) {
		helpBackdrop.addEventListener('click', () => {
			if (isFlipped) toggleFlip();
		});
	}
}
