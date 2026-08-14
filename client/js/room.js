// Room management logic for NodeCrypt web client
// NodeCrypt 网页客户端的房间管理逻辑

import {
	createAvatarSVG
} from './util.avatar.js';
import {
	renderChatArea,
	addSystemMsg,
	updateChatInputStyle,
	updateMessageStatus
} from './chat.js';
import {
	renderMainHeader,
	renderUserList,
	updateMembersCount
} from './ui.js';
import {
	escapeHTML
} from './util.string.js';
import {
	$id,
	createElement
} from './util.dom.js';
import { t } from './util.i18n.js';
import { callManager } from './util.call.js';
let roomsData = [];
let activeRoomIndex = -1;

// Get a new room data object
// 获取一个新的房间数据对象
export function getNewRoomData() {
	return {
		roomName: '',
		userList: [],
		userMap: {},
		myId: null,
		myUserName: '',
		chat: null,
		messages: [],
		prevUserList: [],
		knownUserIds: new Set(),
		unreadCount: 0,
		privateChatTargetId: null,
		privateChatTargetName: null,
		emptyRoomNoticeShown: false,
		receiptedMessageIds: new Set()
	}
}

// Update the document title with the total unread badge
// 更新标题栏：未读总数显示为角标
function updateDocumentTitle() {
	let total = 0;
	for (const rd of roomsData) {
		if (typeof rd.unreadCount === 'number') total += rd.unreadCount;
	}
	const rd = roomsData[activeRoomIndex];
	const base = rd && rd.roomName ? '#' + rd.roomName : 'NodeCrypt';
	document.title = total > 0 ? `(${total}) ${base}` : base;
}

// Switch to another room by index
// 切换到指定索引的房间
export function switchRoom(index) {
	if (index < 0 || index >= roomsData.length) return;
	activeRoomIndex = index;
	const rd = roomsData[index];
	if (typeof rd.unreadCount === 'number') rd.unreadCount = 0;
	const sidebarUsername = document.getElementById('sidebar-username');
	if (sidebarUsername) sidebarUsername.textContent = rd.myUserName;
	setSidebarAvatar(rd.myUserName);
	renderRooms(index);
	renderMainHeader();
	renderUserList(false);
	renderChatArea();
	updateChatInputStyle();
	updateDocumentTitle();
	// Send read receipts for messages received while this room was inactive
	// 为之前在后台收到的消息补发已读回执
	rd.messages.forEach(m => {
		if (m.type === 'other' && m.id && m.clientId) {
			sendReadReceiptForMessage(rd, { id: m.id, clientId: m.clientId });
		}
	})
}

// Send a read receipt for a received message (once per message)
// 为收到的消息发送已读回执（每条仅一次）
function sendReadReceiptForMessage(rd, msg) {
	if (!rd || !msg || !msg.id || !msg.clientId || !rd.chat) return;
	if (!rd.receiptedMessageIds) rd.receiptedMessageIds = new Set();
	if (rd.receiptedMessageIds.has(msg.id)) return;
	rd.receiptedMessageIds.add(msg.id);
	try {
		rd.chat.sendReadReceipt(msg.clientId, msg.id);
	} catch (error) {
		console.warn('sendReadReceipt failed:', error);
	}
}

// Whether the user is actually looking at this window right now
// 用户当前是否真的在看这个窗口（可见且聚焦）
export function isUserViewing() {
	return document.visibilityState === 'visible' && document.hasFocus();
}

// Flush read receipts for the active room when the user returns to the window
// 用户回到窗口时，为当前房间补发已读回执
// Flush read receipts for the active room when the user interacts with it.
// requireFocus=true 用于"回到窗口"类事件（可见且聚焦才算在看）；
// requireFocus=false 用于滚轮/触摸滚动——滚动一个可见（即使未聚焦）的
// 窗口本身就是主动阅读消息的行为，Windows 上滚轮不会给窗口焦点。
function flushReadReceipts(requireFocus) {
	const viewing = document.visibilityState === 'visible' && (!requireFocus || document.hasFocus());
	if (!viewing) return;
	const rd = roomsData[activeRoomIndex];
	if (!rd) return;
	rd.messages.forEach(m => {
		if (m.type === 'other' && m.id && m.clientId) {
			sendReadReceiptForMessage(rd, { id: m.id, clientId: m.clientId });
		}
	});
}

// Bind visibility/focus/interaction handlers once: receipts are only sent when
// the recipient is actually looking at the chat. Minimized or unfocused windows
// hold receipts until the user comes back or actively scrolls the messages.
// 绑定可见性/焦点/交互处理（仅一次）：只有接收方真的在看聊天时才发回执；
// 窗口最小化时先扣着，用户回到窗口（聚焦/点击）或主动滑动消息时再补发。
let readReceiptVisibilityBound = false;
function bindReadReceiptVisibility() {
	if (readReceiptVisibilityBound) return;
	readReceiptVisibilityBound = true;
	window.addEventListener('visibilitychange', () => flushReadReceipts(true));
	window.addEventListener('focus', () => flushReadReceipts(true));
	document.addEventListener('pointerdown', () => flushReadReceipts(true), { passive: true, capture: true });
	// 滚轮 / 触摸滑动消息 = 主动阅读：窗口可见即可，不要求焦点
	// Wheel / touch scrolling counts as actively reading: only visibility required
	document.addEventListener('wheel', () => flushReadReceipts(false), { passive: true, capture: true });
	document.addEventListener('touchmove', () => flushReadReceipts(false), { passive: true, capture: true });
}
bindReadReceiptVisibility();

// Set the sidebar avatar
// 设置侧边栏头像
export function setSidebarAvatar(userName) {
	if (!userName) return;
	const svg = createAvatarSVG(userName);
	const el = $id('sidebar-user-avatar');
	if (el) {
		const cleanSvg = svg.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
		el.innerHTML = cleanSvg
	}
}

// Render the room list
// 渲染房间列表
export function renderRooms(activeId = 0) {
	const roomList = $id('room-list');
	roomList.innerHTML = '';
	roomsData.forEach((rd, i) => {
		const div = createElement('div', {
			class: 'room' + (i === activeId ? ' active' : ''),
			onclick: () => switchRoom(i)
		});
		div.setAttribute('role', 'button');
		div.setAttribute('tabindex', '0');
		div.setAttribute('aria-label', '#' + rd.roomName);
		div.onkeydown = (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				switchRoom(i);
			}
		};
		const safeRoomName = escapeHTML(rd.roomName);
		let unreadHtml = '';
		if (rd.unreadCount && i !== activeId) {
			unreadHtml = `<span class="room-unread-badge">${rd.unreadCount>99?'99+':rd.unreadCount}</span>`
		}
		div.innerHTML = `<div class="info"><div class="title">#${safeRoomName}</div></div>${unreadHtml}`;
		roomList.appendChild(div)
	})
}

// Join a room
// 加入一个房间
export function joinRoom(userName, roomName, password, modal = null, onResult) {
	const newRd = getNewRoomData();
	newRd.roomName = roomName;
	newRd.myUserName = userName;
	newRd.password = password;
	roomsData.push(newRd);
	const idx = roomsData.length - 1;
	const prevActiveIndex = activeRoomIndex;
	switchRoom(idx);
	const sidebarUsername = $id('sidebar-username');
	if (sidebarUsername) sidebarUsername.textContent = userName;
	setSidebarAvatar(userName);
	let closed = false;
	let secured = false;
	// Fail the join attempt: remove the room entry, switch back to the
	// previous room and report the failure so the form can recover.
	const failJoin = () => {
		if (closed) return;
		closed = true;
		const chatInst = roomsData[idx] ? roomsData[idx].chat : null;
		roomsData.splice(idx, 1);
		if (chatInst) {
			try {
				// Prevent the failed instance from reconnecting in the background
				chatInst.credentials = null;
				chatInst.disconnect()
			} catch (error) {}
		}
		activeRoomIndex = prevActiveIndex;
		if (prevActiveIndex >= 0) switchRoom(prevActiveIndex);
		if (onResult) onResult(false)
	};
	const callbacks = {
		onServerClosed: () => {
			if (!secured) failJoin();
		},		onServerSecured: () => {
			secured = true;
			if (closed) return;
			closed = true;
			if (modal) modal.remove();
			else {
				const loginContainer = $id('login-container');
				if (loginContainer) loginContainer.style.display = 'none';
				const chatContainer = $id('chat-container');
				if (chatContainer) chatContainer.style.display = '';
				// Leave the login page styles behind once the chat opens
				document.body.classList.remove('login-page');
			}
			if (onResult) onResult(true)
			addSystemMsg(t('system.secured', 'connection secured'))
		},
		onClientSecured: (user) => handleClientSecured(idx, user),
		onClientList: (list, selfId) => handleClientList(idx, list, selfId),
		onClientLeft: (clientId) => handleClientLeft(idx, clientId),
		onClientMessage: (msg) => handleClientMessage(idx, msg),
		onReadReceipt: (receipt) => handleReadReceipt(idx, receipt),
		onServerKeyChanged: () => handleServerKeyChanged(idx)
	};
	const chatInst = new window.NodeCrypt(window.config, callbacks);
	chatInst.setCredentials(userName, roomName, password);
	chatInst.connect();
	roomsData[idx].chat = chatInst
}

// Handle a read receipt from another client
// 处理其他客户端发来的已读回执
export function handleReadReceipt(idx, receipt) {
	if (!receipt || !receipt.messageId) return;
	updateMessageStatus(receipt.messageId, 'read');
}

// Warn when the server's public key differs from the previously seen one
// 服务器公钥与之前不同时提示（可能重新部署，也可能是中间人）
export function handleServerKeyChanged(idx) {
	const rd = roomsData[idx];
	if (!rd) return;
	const msg = t('system.server_key_changed', '⚠️ The server encryption key changed since your last visit — if you did not expect this, avoid sharing sensitive info.');
	rd.messages.push({
		type: 'system',
		text: msg
	});
	if (activeRoomIndex === idx) addSystemMsg(msg, true);
}

// Handle the client list update
// 处理客户端列表更新
export function handleClientList(idx, list, selfId) {
	const rd = roomsData[idx];
	if (!rd) return;
	const oldUserIds = new Set((rd.userList || []).map(u => u.clientId));
	const newUserIds = new Set(list.map(u => u.clientId));
	for (const oldId of oldUserIds) {
		if (!newUserIds.has(oldId)) {
			handleClientLeft(idx, oldId)
		}
	}
	rd.userList = list;
	rd.userMap = {};
	list.forEach(u => {
		rd.userMap[u.clientId] = u
	});
	rd.myId = selfId;
	if (activeRoomIndex === idx) {
		renderUserList(false);
		updateMembersCount()
	}
	rd.initCount = (rd.initCount || 0) + 1;
	if (rd.initCount === 2) {
		rd.isInitialized = true;
		rd.knownUserIds = new Set(list.map(u => u.clientId))
	}
}

// Handle client secured event
// 处理客户端安全连接事件
export function handleClientSecured(idx, user) {
	const rd = roomsData[idx];
	if (!rd) return;
	rd.userMap[user.clientId] = user;
	const existingUserIndex = rd.userList.findIndex(u => u.clientId === user.clientId);
	if (existingUserIndex === -1) {
		rd.userList.push(user)
	} else {
		rd.userList[existingUserIndex] = user
	}
	if (activeRoomIndex === idx) {
		renderUserList(false);
		updateMembersCount()
	}
	if (!rd.isInitialized) {
		return
	}
	const isNew = !rd.knownUserIds.has(user.clientId);
	if (isNew) {
		rd.knownUserIds.add(user.clientId);		const name = user.userName || user.username || user.name || t('ui.anonymous', 'Anonymous');
		const msg = `${name} ${t('system.joined', 'joined the conversation')}`;
		rd.messages.push({
			type: 'system',
			text: msg
		});
		if (activeRoomIndex === idx) addSystemMsg(msg, true);
		if (window.notifyMessage) {
			window.notifyMessage(rd.roomName, 'system', msg)
		}
	}
}

// Handle client left event
// 处理客户端离开事件
export function handleClientLeft(idx, clientId) {
	const rd = roomsData[idx];
	if (!rd) return;
	callManager.onUserLeft(idx, clientId);
	if (rd.privateChatTargetId === clientId) {
		rd.privateChatTargetId = null;
		rd.privateChatTargetName = null;
		if (activeRoomIndex === idx) {
			updateChatInputStyle()
		}
	}
	const user = rd.userMap[clientId];
	const name = user ? (user.userName || user.username || user.name || 'Anonymous') : 'Anonymous';
	const msg = `${name} ${t('system.left', 'left the conversation')}`;
	rd.messages.push({
		type: 'system',
		text: msg
	});
	if (activeRoomIndex === idx) addSystemMsg(msg, true);
	rd.userList = rd.userList.filter(u => u.clientId !== clientId);
	delete rd.userMap[clientId];
	if (activeRoomIndex === idx) {
		renderUserList(false);
		updateMembersCount()
	}
}

// Handle client message event
// 处理客户端消息事件
export function handleClientMessage(idx, msg) {
	const newRd = roomsData[idx];
	if (!newRd) return;

	// Prevent processing own messages unless it's a private message sent to oneself
	if (msg.clientId === newRd.myId && msg.userName === newRd.myUserName && !msg.type.includes('_private')) {
		return;
	}

	let msgType = msg.type || 'text';

	// Route voice call signals to the call manager
	// 将语音通话信令路由到通话管理器
	if (msgType === 'call_signal') {
		callManager.handleSignal(idx, msg.clientId, msg.data);
		return;
	}

	// Handle file messages
	if (msgType.startsWith('file_')) {
		// Part 1: Update message history and send notifications (for 'file_start' type)
		if (msgType === 'file_start' || msgType === 'file_start_private') {
			let realUserName = msg.userName;
			if (!realUserName && msg.clientId && newRd.userMap[msg.clientId]) {
				realUserName = newRd.userMap[msg.clientId].userName || newRd.userMap[msg.clientId].username || newRd.userMap[msg.clientId].name;
			}
			const historyMsgType = msgType === 'file_start_private' ? 'file_private' : 'file';
			
			const fileId = msg.data && msg.data.fileId;
			if (fileId) { // Only proceed if we have a fileId
				const messageAlreadyInHistory = newRd.messages.some(
					m => m.msgType === historyMsgType && m.text && m.text.fileId === fileId && m.userName === realUserName
				);

				if (!messageAlreadyInHistory) {
					newRd.messages.push({
						type: 'other',
						text: msg.data, // This is the file metadata object
						userName: realUserName,
						avatar: realUserName,
						msgType: historyMsgType,
						timestamp: (msg.data && msg.data.timestamp) || Date.now() 
					});
				}
			}

			const notificationMsgType = msgType.includes('_private') ? 'private file' : 'file';
			if (window.notifyMessage && msg.data && msg.data.fileName) {
				window.notifyMessage(newRd.roomName, notificationMsgType, `${msg.data.fileName}`, realUserName);
			}
		}

		// Part 2: Handle UI interaction (rendering in active room, or unread count in inactive room)
		if (activeRoomIndex === idx) {
			// If it's the active room, delegate to util.file.js to handle UI and file transfer state.
			// This applies to all file-related messages (file_start, file_volume, file_end, etc.)
			if (window.handleFileMessage) {
				window.handleFileMessage(msg.data, msgType.includes('_private'));
			}
		} else {
			// If it's not the active room, only increment unread count for 'file_start' messages.
			if (msgType === 'file_start' || msgType === 'file_start_private') {
				newRd.unreadCount = (newRd.unreadCount || 0) + 1;
				renderRooms(activeRoomIndex);
				updateDocumentTitle();
			}
		}
		return; // File messages are fully handled.
	}

	// Handle image messages (both new and legacy formats)
	if (msgType === 'image' || msgType === 'image_private') {
		// Already has correct type
	} else if (!msgType.includes('_private')) {
		// Handle legacy image detection
		if (msg.data && typeof msg.data === 'string' && msg.data.startsWith('data:image/')) {
			msgType = 'image';
		} else if (msg.data && typeof msg.data === 'object' && msg.data.image) {
			msgType = 'image';
		}
	}
	let realUserName = msg.userName;
	if (!realUserName && msg.clientId && newRd.userMap[msg.clientId]) {
		realUserName = newRd.userMap[msg.clientId].userName || newRd.userMap[msg.clientId].username || newRd.userMap[msg.clientId].name;
	}

	// Add message to messages array for chat history
	roomsData[idx].messages.push({
		type: 'other',
		text: msg.data,
		userName: realUserName,
		avatar: realUserName,
		msgType: msgType,
		timestamp: Date.now(),
		id: msg.id || null,
		clientId: msg.clientId || null
	});

	// Only add message to chat display if it's for the active room
	if (activeRoomIndex === idx) {
		if (window.addOtherMsg) {
			window.addOtherMsg(msg.data, realUserName, realUserName, false, msgType);
		}
		// Only acknowledge immediately if the user is actually looking at
		// this window; otherwise the receipt waits until they come back.
		// 只有用户真的在看这个窗口时才立即回执；否则等用户回到窗口再补发。
		if (isUserViewing()) {
			sendReadReceiptForMessage(newRd, msg);
		}
	} else {
		roomsData[idx].unreadCount = (roomsData[idx].unreadCount || 0) + 1;
		renderRooms(activeRoomIndex);
		updateDocumentTitle();
	}

	const notificationMsgType = msgType.includes('_private') ? `private ${msgType.split('_')[0]}` : msgType;
	if (window.notifyMessage) {
		window.notifyMessage(newRd.roomName, notificationMsgType, msg.data, realUserName);
	}
}

// Toggle private chat with a user
// 切换与某用户的私聊
export function togglePrivateChat(targetId, targetName) {
	const rd = roomsData[activeRoomIndex];
	if (!rd) return;
	if (rd.privateChatTargetId === targetId) {
		rd.privateChatTargetId = null;
		rd.privateChatTargetName = null
	} else {
		rd.privateChatTargetId = targetId;
		rd.privateChatTargetName = targetName
	}
	renderUserList();
	updateChatInputStyle()
}


// Exit the current room
// 退出当前房间
export function exitRoom() {
	if (activeRoomIndex >= 0 && roomsData[activeRoomIndex]) {
		const chatInst = roomsData[activeRoomIndex].chat;
		callManager.onRoomExit(activeRoomIndex);
		if (chatInst && typeof chatInst.destruct === 'function') {
			chatInst.destruct()
		} else if (chatInst && typeof chatInst.disconnect === 'function') {
			chatInst.disconnect()
		}
		roomsData[activeRoomIndex].chat = null;
		roomsData.splice(activeRoomIndex, 1);
		if (roomsData.length > 0) {
			switchRoom(0);
			return true
		} else {
			updateDocumentTitle();
			return false
		}
	}
	return false
}

export { roomsData, activeRoomIndex };

// Listen for sidebar username update event
// 监听侧边栏用户名更新事件
window.addEventListener('updateSidebarUsername', () => {
	if (activeRoomIndex >= 0 && roomsData[activeRoomIndex]) {
		const rd = roomsData[activeRoomIndex];
		const sidebarUsername = document.getElementById('sidebar-username');
		if (sidebarUsername && rd.myUserName) {
			sidebarUsername.textContent = rd.myUserName;
		}
		// Also update the avatar to ensure consistency
		if (rd.myUserName) {
			setSidebarAvatar(rd.myUserName);
		}
	}
});
