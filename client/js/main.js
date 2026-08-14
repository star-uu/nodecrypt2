// 导入 NodeCrypt 模块（加密功能模块）
// Import the NodeCrypt module (used for encryption)
import './NodeCrypt.js';

// 从 util.file.js 中导入设置文件发送的函数
// Import setupFileSend function from util.file.js
import {
	setupFileSend,
	handleFileMessage,
	downloadFile
} from './util.file.js';

// 从 util.image.js 中导入图片处理功能
// Import image processing functions from util.image.js
import {
	setupImagePaste
} from './util.image.js';

// 从 util.emoji.js 中导入设置表情选择器的函数
// Import setupEmojiPicker function from util.emoji.js
import {
	setupEmojiPicker
} from './util.emoji.js';

// 从 util.settings.js 中导入设置面板的功能函数
// Import functions for settings panel from util.settings.js
import {
	openSettingsPanel,   // 打开设置面板 / Open settings panel
	closeSettingsPanel,  // 关闭设置面板 / Close settings panel
	initSettings,         // 初始化设置 / Initialize settings
	notifyMessage         // 通知信息提示 / Display notification message
} from './util.settings.js';
import { t, updateStaticTexts } from './util.i18n.js';

// 从 util.theme.js 中导入主题功能函数
// Import theme functions from util.theme.js
import {
	initTheme            // 初始化主题 / Initialize theme
} from './util.theme.js';

// 从 util.dom.js 中导入常用 DOM 操作函数
// Import common DOM manipulation functions from util.dom.js
import {
	$,         // 简化的 document.querySelector / Simplified selector
	$id       // document.getElementById 的简写 / Shortcut for getElementById
} from './util.dom.js';

// 从 room.js 中导入房间管理相关变量和函数
// Import room-related variables and functions from room.js
import {
	roomsData,         // 当前所有房间的数据 / Data of all rooms
	activeRoomIndex,   // 当前激活的房间索引 / Index of the active room
	joinRoom           // 加入房间的函数 / Function to join a room
} from './room.js';

// 从 chat.js 中导入聊天功能相关的函数
// Import chat-related functions from chat.js
import {
	addMsg,               // 添加普通消息到聊天窗口 / Add a normal message to chat
	addOtherMsg,          // 添加其他用户消息 / Add message from other users
	addSystemMsg,         // 添加系统消息 / Add a system message
	setupImagePreview,    // 设置图片预览功能 / Setup image preview
	showImageModal,       // Show image modal
	setupInputPlaceholder, // 设置输入框的占位提示 / Setup placeholder for input box
	autoGrowInput,         // 自动调整输入框高度 / Auto adjust input height
	setupNewMessageIndicator // 设置新消息提示 / Setup new message indicator
} from './chat.js';

// 从 ui.js 中导入 UI 界面相关的功能
// Import user interface functions from ui.js
import {	renderUserList,       // 渲染用户列表 / Render user list
	renderMainHeader,     // 渲染主标题栏 / Render main header
	preventSpaceInput,    // 防止输入空格 / Prevent space input in form fields
	loginFormHandler,     // 登录表单提交处理器 / Login form handler
	openLoginModal,       // 打开登录窗口 / Open login modal
	autofillRoomPwd,      // 自动填充房间密码 / Autofill room password
	generateLoginForm,    // 生成登录表单HTML / Generate login form HTML
	initLoginForm,        // 初始化登录表单 / Initialize login form
	initFlipCard          // 初始化翻转卡片功能 / Initialize flip card functionality
} from './ui.js';

// 从 util.call.js 中导入语音通话管理器
// Import the voice call manager from util.call.js
import { callManager } from './util.call.js';

// 设置全局配置参数
// Set global configuration parameters
window.config = {
	wsAddress: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`, // WebSocket 服务器地址 / WebSocket server address
	//wsAddress: `wss://crypt.works`,
	debug: false,                     // 是否开启调试模式 / Enable debug mode (off: no crypto payloads in console)
	iceServers: [                     // WebRTC STUN/TURN 服务器配置 / WebRTC ICE servers
		{ urls: 'stun:stun.cloudflare.com:3478' },
		{ urls: 'stun:stun.l.google.com:19302' }
	]
};

// 在文档开始加载前就初始化语言设置，防止闪烁
// Initialize language settings before document starts loading
initSettings();
updateStaticTexts();

// 把一些函数挂载到 window 对象上供其他模块使用
// Expose functions to the global window object for accessibility
window.addSystemMsg = addSystemMsg;
window.addOtherMsg = addOtherMsg;
window.joinRoom = joinRoom;
window.notifyMessage = notifyMessage;
window.setupEmojiPicker = setupEmojiPicker;
window.handleFileMessage = handleFileMessage;
window.downloadFile = downloadFile;
window.showImageModal = showImageModal;
window.previewImageFile = (fileId) => {
	const transfer = window.fileTransfers && window.fileTransfers.get(fileId);
	if (transfer && transfer.previewUrl) showImageModal(transfer.previewUrl);
};

// 当 DOM 内容加载完成后执行初始化逻辑
// Run initialization logic when the DOM content is fully loaded
window.addEventListener('DOMContentLoaded', () => {
	// 移除预加载样式类，允许过渡效果
	// Remove preload class to allow transitions
	setTimeout(() => {
		document.body.classList.remove('preload');
	}, 300);
	
	// 初始化登录表单 / Initialize login form
	initLoginForm();

	const loginForm = $id('login-form');               // 登录表单 / Login form

	if (loginForm) {
		// 监听登录表单提交事件 / Listen to login form submission
		loginForm.addEventListener('submit', loginFormHandler(null))
	}

	const joinBtn = $('.join-room'); // 加入房间按钮 / Join room button
	if (joinBtn) {
		joinBtn.onclick = openLoginModal; // 点击打开登录窗口 / Click to open login modal
		// 键盘可访问性 / Keyboard accessibility
		joinBtn.setAttribute('role', 'button');
		joinBtn.setAttribute('tabindex', '0');
		joinBtn.onkeydown = (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				openLoginModal();
			}
		};
	}
	// 阻止用户输入用户名、房间名和密码时输入空格
	// Prevent space input for username, room name, and password fields
	preventSpaceInput($id('userName'));
	preventSpaceInput($id('roomName'));
	// 密码允许任意字符（含符号），仅限制长度，不做空格过滤
	// Password allows any characters (including symbols) — length-limited only
	
	// 初始化翻转卡片功能 / Initialize flip card functionality
	initFlipCard();
	
	// 初始化辅助功能和界面设置
	// Initialize autofill, input placeholders, and menus
	autofillRoomPwd();	setupInputPlaceholder();
	setupImagePreview();	setupEmojiPicker();
	setupNewMessageIndicator();
	// 由于我们已经在DOM加载前预先初始化了语言设置，这里不需要重复初始化
	// initSettings();
	// updateStaticTexts(); // 在初始化设置后更新静态文本 / Update static texts after initializing settings
	initTheme(); // 初始化主题 / Initialize theme
	
	// 初始化语音通话管理器
	// Initialize the voice call manager
	callManager.init({
		getRoomAt: (idx) => (idx >= 0 && idx < roomsData.length) ? roomsData[idx] : null,
		getRoom: () => roomsData[activeRoomIndex] || null,
		getActiveRoomIdx: () => activeRoomIndex
	});
	
	const settingsBtn = $id('settings-btn'); // 设置按钮 / Settings button
	if (settingsBtn) {
		settingsBtn.onclick = (e) => {
			e.stopPropagation();  // 阻止事件冒泡 / Stop event from bubbling
			openSettingsPanel(); // 打开设置面板 / Open settings panel
		}
	}

	// 设置返回按钮事件处理 / Settings back button event handler
	const settingsBackBtn = $id('settings-back-btn');
	if (settingsBackBtn) {
		settingsBackBtn.onclick = (e) => {
			e.stopPropagation();
			closeSettingsPanel(); // 关闭设置面板 / Close settings panel
		}
	}

	// Esc 依次关闭：⋮菜单 → 表情面板 → 设置面板 / Esc closes: menu → emoji picker → settings
	document.addEventListener('keydown', (e) => {
		if (e.key !== 'Escape') return;
		const moreBtn = $id('more-btn');
		const menu = $id('more-menu');
		if (menu && moreBtn && menu.classList.contains('open')) {
			moreBtn.click();
			return;
		}
		const picker = document.querySelector('emoji-picker.show');
		if (picker) {
			document.querySelector('.chat-emoji-btn')?.click();
			return;
		}
		const settings = $id('settings-sidebar');
		if (settings && (settings.classList.contains('open') || settings.classList.contains('mobile-open'))) {
			closeSettingsPanel();
		}
	});
	// 点击其他地方时关闭设置面板 (已移除，因为现在使用侧边栏形式)
	// Close settings panel when clicking outside (removed since we now use sidebar format)
	const input = document.querySelector('.input-message-input'); // 消息输入框 / Message input box
	const sendButton = $id('send-message-btn'); // 发送按钮 / Send button

	const createMessageId = () => {
		if (window.crypto && typeof window.crypto.randomUUID === 'function') {
			return 'm_' + window.crypto.randomUUID();
		}
		return 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
	};

	function updateSendButtonState() {
		if (!sendButton) return;
		const text = input ? input.innerText.trim() : '';
		const imageCount = input ? input.parentNode.querySelectorAll('.input-image-preview').length : 0;
		const hasContent = text.length > 0 || imageCount > 0;
		sendButton.disabled = !hasContent;
		sendButton.classList.toggle('is-disabled', !hasContent);
		sendButton.setAttribute('aria-disabled', hasContent ? 'false' : 'true');
	}
	
	// 设置图片粘贴功能
	// Setup image paste functionality
	const imagePasteHandler = setupImagePaste('.input-message-input', updateSendButtonState);
	updateSendButtonState();
	
	if (input) {
		input.focus(); // 自动聚焦 / Auto focus
		input.addEventListener('keydown', (e) => {
			// 按下 Enter 键并且不按 Shift，表示发送消息
			// Pressing Enter (without Shift) sends the message
			if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
				e.preventDefault();
				sendMessage();
			}
		});
	}

	// 移动端软键盘适配：键盘弹出时把固定输入条抬到键盘上方。
	// 部分浏览器（尤其 iOS，Android 偶发）不会自动抬升 fixed 元素，
	// 这里用 visualViewport 计算键盘遮挡高度并实时调整。
	// Mobile keyboard adaptation: lift the fixed input bar above the soft
	// keyboard via visualViewport (iOS keeps fixed elements below the layout
	// viewport, Android occasionally skips the lift).
	const inputAreaEl = document.querySelector('.chat-input-area');
	const chatContainerEl = $id('chat-container');
	let appliedKeyboardOffset = 0;

	function syncInputToKeyboard() {
		const isMobile = window.innerWidth <= 768;
		if (!isMobile) {
			if (appliedKeyboardOffset !== 0) {
				appliedKeyboardOffset = 0;
				inputAreaEl && (inputAreaEl.style.bottom = '');
			}
			document.documentElement.style.setProperty('--vvh', '');
			document.body.classList.remove('keyboard-open');
			return;
		}
		const vv = window.visualViewport;
		let overlap = 0;
		let vvHeight = 0;
		if (vv) {
			overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
			vvHeight = Math.round(vv.height);
		}
		overlap = Math.round(overlap);
		if (overlap === appliedKeyboardOffset) return;
		appliedKeyboardOffset = overlap;
		inputAreaEl.style.bottom = overlap > 0 ? overlap + 'px' : '';
		// 键盘弹出时把聊天容器压到可视视口高度，避免消息被键盘挡住
		// Shrink the chat layout to the visual viewport so messages are not
		// hidden behind the keyboard (iOS keeps 100dvh fixed).
		const inChat = chatContainerEl && chatContainerEl.style.display !== 'none';
		if (inChat && vvHeight > 0 && overlap > 0) {
			document.documentElement.style.setProperty('--vvh', vvHeight + 'px');
			document.body.classList.add('keyboard-open');
		} else {
			document.documentElement.style.setProperty('--vvh', '');
			document.body.classList.remove('keyboard-open');
		}
		// 键盘弹出时把最新消息滚到可见区域（输入条上方）
		// Keep the latest messages visible above the lifted input bar
		if (overlap > 0) {
			const chatArea = $id('chat-area');
			if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
		}
	}

	if (window.visualViewport) {
		window.visualViewport.addEventListener('resize', syncInputToKeyboard);
		window.visualViewport.addEventListener('scroll', syncInputToKeyboard);
	}
	window.addEventListener('resize', syncInputToKeyboard);
	window.addEventListener('orientationchange', () => setTimeout(syncInputToKeyboard, 250));
	// 输入框聚焦/失焦时重试几次，覆盖键盘动画期间的竞态
	// Retry a few times around focus/blur to cover the keyboard animation race
	if (input) {
		input.addEventListener('focus', () => {
			[50, 150, 350, 600].forEach(ms => setTimeout(syncInputToKeyboard, ms));
		});
		input.addEventListener('blur', () => {
			[50, 250].forEach(ms => setTimeout(syncInputToKeyboard, ms));
		});
	}
	
	if (sendButton) {
		sendButton.addEventListener('click', sendMessage);
	}

	// 发送消息的统一函数
	// Unified function to send messages
	function sendMessage() {
		const text = input.innerText.trim(); // 获取输入的文本 / Get input text
		const images = imagePasteHandler ? imagePasteHandler.getCurrentImages() : []; // 获取所有图片

		if (!text && images.length === 0) return; // 如果没有文本且没有图片，则不发送
		const rd = roomsData[activeRoomIndex]; // 当前房间数据 / Current room data

		// 房间里没有其他成员时提醒一次：消息只保存在本机
		// One-time notice: messages sent while alone stay on this device only
		const notifyIfAlone = () => {
			if (!rd || rd.emptyRoomNoticeShown) return;
			if (rd.chat && typeof rd.chat.getRecipientCount === 'function' && rd.chat.getRecipientCount() === 0) {
				rd.emptyRoomNoticeShown = true;
				addSystemMsg(t('system.room_empty', 'You are alone in this room — messages stay on this device only.'));
			}
		};
		
		if (rd && rd.chat) {
			if (images.length > 0) {
				// 发送包含图片的消息 (支持多图和文字合并)
				// Send message with images (supports multiple images and text combined)
				const messageContent = {
					text: text || '', // 包含文字内容，如果有的话
					images: images    // 包含所有图片数据
				};

				if (rd.privateChatTargetId) {
					const messageId = createMessageId();
					// 私聊图片消息加密并发送
					// Encrypt and send private image message
					const targetClient = rd.chat.channel[rd.privateChatTargetId];
					if (targetClient && targetClient.shared) {
						const clientMessagePayload = {
							a: 'm',
							t: 'image_private',
							d: messageContent,
							id: messageId
						};
						const encryptedClientMessage = rd.chat.encryptClientMessage(clientMessagePayload, targetClient.shared);
						const serverRelayPayload = {
							a: 'c',
							p: encryptedClientMessage,
							c: rd.privateChatTargetId
						};
						const encryptedMessageForServer = rd.chat.encryptServerMessage(serverRelayPayload, rd.chat.serverShared);
						const sent = rd.chat.sendMessage(encryptedMessageForServer);
						addMsg(messageContent, false, 'image_private', null, { id: messageId, status: sent ? 'sent' : 'failed' });
					} else {
						addSystemMsg(`${t('system.private_message_failed', 'Cannot send private message to')} ${rd.privateChatTargetName}. ${t('system.user_not_connected', 'User might not be fully connected.')}`)
					}
				} else {
					// 公共频道图片消息发送
					// Send image message to public channel
					const messageId = createMessageId();
					const sent = rd.chat.sendChannelMessage('image', messageContent, messageId);
					addMsg(messageContent, false, 'image', null, { id: messageId, status: sent ? 'sent' : 'failed' });
					notifyIfAlone();
				}
				
				imagePasteHandler.clearImages(); // 清除所有图片预览
			} else if (text) {
				// 发送纯文本消息
				// Send text-only message
				if (rd.privateChatTargetId) {
					const messageId = createMessageId();
					// 私聊消息加密并发送
					// Encrypt and send private message
					const targetClient = rd.chat.channel[rd.privateChatTargetId];
					if (targetClient && targetClient.shared) {
						const clientMessagePayload = {
							a: 'm',
							t: 'text_private',
							d: text,
							id: messageId
						};
						const encryptedClientMessage = rd.chat.encryptClientMessage(clientMessagePayload, targetClient.shared);
						const serverRelayPayload = {
							a: 'c',
							p: encryptedClientMessage,
							c: rd.privateChatTargetId
						};
						const encryptedMessageForServer = rd.chat.encryptServerMessage(serverRelayPayload, rd.chat.serverShared);
						const sent = rd.chat.sendMessage(encryptedMessageForServer);
						addMsg(text, false, 'text_private', null, { id: messageId, status: sent ? 'sent' : 'failed' });
					} else {
						addSystemMsg(`${t('system.private_message_failed', 'Cannot send private message to')} ${rd.privateChatTargetName}. ${t('system.user_not_connected', 'User might not be fully connected.')}`)
					}
				} else {
					// 公共频道消息发送
					// Send public message
					const messageId = createMessageId();
					const sent = rd.chat.sendChannelMessage('text', text, messageId);
					addMsg(text, false, 'text', null, { id: messageId, status: sent ? 'sent' : 'failed' });
					notifyIfAlone();
				}
			}
			
			// 清空输入框并触发 input 事件
			// Clear input and trigger input event
			input.innerHTML = ''; // 清空输入框内容 / Clear input field content
			if (imagePasteHandler && typeof imagePasteHandler.refreshPlaceholder === 'function') {
				imagePasteHandler.refreshPlaceholder(); // 更新 placeholder 状态
			}
			autoGrowInput(); // 调整输入框高度
		}
	}
	
	// 设置发送文件功能
	// Setup file sending functionality
	setupFileSend({
		inputSelector: '.input-message-input', // 消息输入框选择器 / Message input selector
		attachBtnSelector: '.chat-attach-btn', // 附件按钮选择器 / Attach button selector
		fileInputSelector: '.new-message-wrapper input[type="file"]', // 文件输入框选择器 / File input selector
		onSend: (message) => {
			const rd = roomsData[activeRoomIndex];
			if (rd && rd.chat) {
				const userName = rd.myUserName || '';
				const msgWithUser = { ...message, userName };
				if (rd.privateChatTargetId) {
					const messageId = createMessageId();
					// 私聊文件加密并发送
					// Encrypt and send private file message
					const targetClient = rd.chat.channel[rd.privateChatTargetId];
					if (targetClient && targetClient.shared) {
						const clientMessagePayload = {
							a: 'm',
							t: msgWithUser.type + '_private',
							d: msgWithUser
						};
						const encryptedClientMessage = rd.chat.encryptClientMessage(clientMessagePayload, targetClient.shared);
						const serverRelayPayload = {
							a: 'c',
							p: encryptedClientMessage,
							c: rd.privateChatTargetId
						};
						const encryptedMessageForServer = rd.chat.encryptServerMessage(serverRelayPayload, rd.chat.serverShared);
						rd.chat.sendMessage(encryptedMessageForServer);
						
						// 添加到自己的聊天记录
						if (msgWithUser.type === 'file_start') {
							addMsg(msgWithUser, false, 'file_private');
						}					} else {
						addSystemMsg(`${t('system.private_file_failed', 'Cannot send private file to')} ${rd.privateChatTargetName}. ${t('system.user_not_connected', 'User might not be fully connected.')}`)
					}
				} else {
					// 公共频道文件发送
					// Send file to public channel
					rd.chat.sendChannelMessage(msgWithUser.type, msgWithUser);
					
					// 添加到自己的聊天记录
					if (msgWithUser.type === 'file_start') {
						addMsg(msgWithUser, false, 'file');
					}
				}
			}		}
	});


	// 判断是否为移动端
	// Check if the device is mobile
	const isMobile = () => window.innerWidth <= 768;

	// 渲染主界面元素
	// Render main UI elements
	renderMainHeader();
	renderUserList();

	const roomList = $id('room-list');
	const sidebar = $id('sidebar');
	const rightbar = $id('rightbar');
	const sidebarMask = $id('mobile-sidebar-mask');
	const rightbarMask = $id('mobile-rightbar-mask');

	// 在移动端点击房间列表后关闭侧边栏
	// On mobile, clicking room list closes sidebar
	if (roomList) {
		roomList.addEventListener('click', () => {
			if (isMobile()) {
				sidebar?.classList.remove('mobile-open');
				sidebarMask?.classList.remove('active');
			}
		});
	}
});

// Listen for language change events
// 监听语言切换事件
window.addEventListener('languageChange', (event) => {
	updateStaticTexts();
});

// 全局拖拽文件自动打开附件功能
// Global drag file to auto trigger attach button
let dragCounter = 0;
let hasTriggeredAttach = false;

// 监听文件上传模态框关闭事件，重置拖拽标志位
window.addEventListener('fileUploadModalClosed', () => {
	hasTriggeredAttach = false;
});

document.addEventListener('dragenter', (e) => {
	dragCounter++;
	if (!hasTriggeredAttach && e.dataTransfer.items.length > 0) {
		// 检查是否有文件
		for (let item of e.dataTransfer.items) {
			if (item.kind === 'file') {
				// 自动点击附件按钮
				const attachBtn = document.querySelector('.chat-attach-btn');
				if (attachBtn) {
					attachBtn.click();
					hasTriggeredAttach = true;
				}
				break;
			}
		}
	}
});

document.addEventListener('dragleave', (e) => {
	dragCounter--;
	if (dragCounter === 0) {
		hasTriggeredAttach = false;
	}
});

document.addEventListener('dragover', (e) => {
	e.preventDefault();
});

document.addEventListener('drop', (e) => {
	e.preventDefault();
	dragCounter = 0;
	hasTriggeredAttach = false;
});
