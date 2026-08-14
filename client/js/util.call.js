// WebRTC voice call manager for NodeCrypt
// NodeCrypt 语音通话管理器（基于 WebRTC，端到端加密）

import { t } from './util.i18n.js';
import { $id, addClass, removeClass } from './util.dom.js';
import { createAvatarSVG } from './util.avatar.js';

// Default STUN servers for NAT traversal (media stays peer-to-peer and SRTP-encrypted)
// 默认 STUN 服务器（媒体点对点传输，SRTP 加密，服务器无法解密）
const DEFAULT_ICE_SERVERS = [
	{ urls: 'stun:stun.cloudflare.com:3478' },
	{ urls: 'stun:stun.l.google.com:19302' }
];

// Unanswered call timeout (ms)
// 未接听超时时间（毫秒）
const CALL_TIMEOUT = 45000;

// Signal message type routed through the existing E2E encrypted channel
// 通过现有端到端加密通道传输的信令消息类型
const SIGNAL_TYPE = 'call_signal';

class CallManager {
	constructor() {
		this.state = 'idle'; // idle | outgoing | incoming | in-call
		this.roomIdx = -1;
		this.targetClientId = null;
		this.targetName = '';
		this.callId = null;
		this.peer = null;
		this.localStream = null;
		this.pendingSdp = null;
		this.pendingCandidates = [];
		this.isMuted = false;
		this.speakerOn = false;
		this.helpers = null;
		this.ringtone = null;
		this.ringInterval = null;
		this.timeoutTimer = null;
		this.durationTimer = null;
		this.startTime = 0;
		this.uiReady = false;
	}

	// Inject runtime helpers (roomsData / activeRoomIndex accessors)
	// 注入运行时辅助函数
	init(helpers) {
		this.helpers = helpers;
		this.ensureUI();
	}

	// -- helpers -----------------------------------------------------------

	getRoomAt(idx) {
		if (!this.helpers) return null;
		return this.helpers.getRoomAt(idx);
	}

	getChat(roomIdx) {
		const room = this.getRoomAt(roomIdx);
		return room && room.chat ? room.chat : null;
	}

	systemMsg(text) {
		if (window.addSystemMsg) {
			try {
				window.addSystemMsg(text);
			} catch (error) {
				console.error('call systemMsg failed', error);
			}
		}
	}

	// Send an encrypted signal to a specific client through the room's chat channel
	// 通过房间的加密通道向指定客户端发送信令
	sendSignalToRoom(roomIdx, targetClientId, payload) {
		const chat = this.getChat(roomIdx);
		if (!chat) return false;
		const target = chat.channel[targetClientId];
		if (!target || !target.shared) return false;
		try {
			const encryptedClient = chat.encryptClientMessage({
				a: 'm',
				t: SIGNAL_TYPE,
				d: payload
			}, target.shared);
			if (!encryptedClient) return false;
			const encryptedServer = chat.encryptServerMessage({
				a: 'c',
				p: encryptedClient,
				c: targetClientId
			}, chat.serverShared);
			if (!encryptedServer) return false;
			return chat.sendMessage(encryptedServer);
		} catch (error) {
			console.error('sendSignalToRoom failed', error);
			return false;
		}
	}

	sendSignal(targetClientId, payload) {
		return this.sendSignalToRoom(this.roomIdx, targetClientId, payload);
	}

	// -- public API ---------------------------------------------------------

	// Start a voice call to a member
	// 向某个成员发起语音通话
	async startCall(targetId, targetName) {
		if (this.state !== 'idle') {
			this.systemMsg(t('call.already_in_call', 'You are already in a call.'));
			return false;
		}
		if (!this.helpers) return false;

		const roomIdx = this.helpers.getActiveRoomIdx();
		const chat = this.getChat(roomIdx);
		if (!chat) return false;

		const target = chat.channel[targetId];
		if (!target || !target.shared) {
			this.systemMsg(`${t('call.cannot_reach', 'Cannot reach')} ${targetName || ''}. ${t('system.user_not_connected', 'User might not be fully connected.')}`);
			return false;
		}
		if (!window.RTCPeerConnection || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
			this.systemMsg(t('call.unsupported', 'Voice calls are not supported in this browser.'));
			return false;
		}

		let stream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: { echoCancellation: true, noiseSuppression: true },
				video: false
			});
		} catch (error) {
			console.error('getUserMedia failed', error);
			this.systemMsg(t('call.mic_error', 'Unable to access microphone. Please check browser permissions and devices.'));
			return false;
		}

		this.roomIdx = roomIdx;
		this.targetClientId = targetId;
		this.targetName = targetName || targetId;
		this.callId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
		this.localStream = stream;
		this.isMuted = false;
		this.speakerOn = false;
		this.state = 'outgoing';

		this.peer = this.createPeerConnection();
		stream.getTracks().forEach(track => this.peer.addTrack(track, stream));

		try {
			const offer = await this.peer.createOffer();
			await this.peer.setLocalDescription(offer);
		} catch (error) {
			console.error('createOffer failed', error);
			this.hangup(true);
			this.systemMsg(t('call.failed', 'Call failed'));
			return false;
		}

		const sent = this.sendSignal(targetId, {
			action: 'offer',
			callId: this.callId,
			sdp: this.peer.localDescription,
			callerName: this.getMyName(roomIdx)
		});
		if (!sent) {
			this.hangup(true);
			this.systemMsg(`${t('call.cannot_reach', 'Cannot reach')} ${this.targetName}.`);
			return false;
		}

		this.showUI('outgoing');
		this.startRingtone('ringback');
		this.timeoutTimer = setTimeout(() => this.handleOutgoingTimeout(), CALL_TIMEOUT);
		return true;
	}

	// Handle encrypted call signals routed from room.js
	// 处理来自 room.js 的加密通话信令
	handleSignal(roomIdx, fromClientId, data) {
		if (!data || !data.action || !fromClientId) return;
		switch (data.action) {
			case 'offer':
				this.handleOffer(fromClientId, data, roomIdx);
				break;
			case 'answer':
				this.handleAnswer(fromClientId, data);
				break;
			case 'ice':
				this.handleIce(fromClientId, data);
				break;
			case 'end':
				this.handleRemoteEnd(fromClientId, data);
				break;
			default:
				break;
		}
	}

	// Handle incoming offer
	// 处理来电
	async handleOffer(fromClientId, data, roomIdx) {
		if (this.state !== 'idle') {
			// Ignore duplicate offers from the same active call
			if (this.state === 'incoming' && fromClientId === this.targetClientId && data.callId === this.callId) {
				return;
			}
			this.sendSignalToRoom(roomIdx, fromClientId, {
				action: 'answer',
				callId: data.callId,
				accepted: false,
				reason: 'busy'
			});
			return;
		}

		const chat = this.getChat(roomIdx);
		if (!chat) return;

		this.roomIdx = roomIdx;
		this.targetClientId = fromClientId;
		this.callId = data.callId;
		this.pendingSdp = data.sdp;
		this.pendingCandidates = [];
		const user = chat.channel[fromClientId];
		this.targetName = (user && user.username) || data.callerName || fromClientId;

		this.state = 'incoming';
		this.showUI('incoming');
		this.startRingtone('ring');

		const room = this.getRoomAt(roomIdx);
		if (window.notifyMessage) {
			try {
				window.notifyMessage(room ? room.roomName : '', 'call', t('call.incoming_call', 'Incoming voice call'), this.targetName);
			} catch (error) {
				console.error('call notification failed', error);
			}
		}

		if (!window.RTCPeerConnection || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
			setTimeout(() => this.declineIncoming(), 50);
			return;
		}

		this.timeoutTimer = setTimeout(() => {
			if (this.state !== 'incoming') return;
			this.systemMsg(t('call.missed', 'Missed call'));
			this.sendSignal(this.targetClientId, {
				action: 'end',
				callId: this.callId,
				reason: 'timeout'
			});
			this.cleanup();
		}, CALL_TIMEOUT);
	}

	// Accept the incoming call
	// 接听来电
	async acceptIncoming() {
		if (this.state !== 'incoming') return;
		const targetId = this.targetClientId;
		this.stopRingtone();
		if (this.timeoutTimer) {
			clearTimeout(this.timeoutTimer);
			this.timeoutTimer = null;
		}

		let stream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: { echoCancellation: true, noiseSuppression: true },
				video: false
			});
		} catch (error) {
			console.error('getUserMedia failed', error);
			this.systemMsg(t('call.mic_error', 'Unable to access microphone. Please check browser permissions and devices.'));
			this.sendSignal(targetId, {
				action: 'end',
				callId: this.callId,
				reason: 'error'
			});
			this.cleanup();
			return;
		}

		this.localStream = stream;
		this.peer = this.createPeerConnection();
		stream.getTracks().forEach(track => this.peer.addTrack(track, stream));

		try {
			await this.peer.setRemoteDescription(new RTCSessionDescription(this.pendingSdp));
			this.flushPendingCandidates();
			const answer = await this.peer.createAnswer();
			await this.peer.setLocalDescription(answer);
			this.state = 'in-call';
			this.showUI('active');
			this.sendSignal(targetId, {
				action: 'answer',
				callId: this.callId,
				accepted: true,
				sdp: this.peer.localDescription
			});
		} catch (error) {
			console.error('acceptIncoming failed', error);
			this.sendSignal(targetId, {
				action: 'end',
				callId: this.callId,
				reason: 'error'
			});
			this.systemMsg(t('call.failed', 'Call failed'));
			this.cleanup();
		}
	}

	// Decline the incoming call
	// 拒接来电
	declineIncoming() {
		if (this.state !== 'incoming') return;
		this.sendSignal(this.targetClientId, {
			action: 'end',
			callId: this.callId,
			reason: 'declined'
		});
		this.systemMsg(t('call.call_declined', 'Call declined'));
		this.cleanup();
	}

	// Handle answer from the callee
	// 处理对方的应答
	async handleAnswer(fromClientId, data) {
		if (this.state !== 'outgoing' || fromClientId !== this.targetClientId || data.callId !== this.callId) {
			return;
		}
		if (this.timeoutTimer) {
			clearTimeout(this.timeoutTimer);
			this.timeoutTimer = null;
		}
		this.stopRingtone();

		if (!data.accepted) {
			const reason = data.reason || 'declined';
			if (reason === 'busy') {
				this.systemMsg(`${this.targetName} ${t('call.busy', 'is busy')}`);
			} else {
				this.systemMsg(`${this.targetName} ${t('call.declined', 'declined the call')}`);
			}
			this.cleanup();
			return;
		}

		try {
			await this.peer.setRemoteDescription(new RTCSessionDescription(data.sdp));
			this.state = 'in-call';
			this.showUI('active');
		} catch (error) {
			console.error('handleAnswer failed', error);
			this.systemMsg(t('call.failed', 'Call failed'));
			this.cleanup();
		}
	}

	// Handle remote ICE candidate
	// 处理对方的 ICE 候选
	handleIce(fromClientId, data) {
		if (fromClientId !== this.targetClientId || data.callId !== this.callId || !data.candidate) {
			return;
		}
		if (this.peer) {
			this.peer.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(error => {
				console.error('addIceCandidate failed', error);
			});
		} else {
			this.pendingCandidates.push(data.candidate);
		}
	}

	// Handle call end from the remote side
	// 处理对方结束通话
	handleRemoteEnd(fromClientId, data) {
		if (this.state === 'idle' || fromClientId !== this.targetClientId || data.callId !== this.callId) {
			return;
		}
		const reason = data.reason || 'ended';
		if (reason === 'declined') {
			this.systemMsg(`${this.targetName} ${t('call.declined', 'declined the call')}`);
		} else if (reason === 'busy') {
			this.systemMsg(`${this.targetName} ${t('call.busy', 'is busy')}`);
		} else if (reason === 'canceled' || reason === 'timeout') {
			this.systemMsg(t('call.canceled', 'Call canceled'));
		} else if (reason === 'error') {
			this.systemMsg(t('call.failed', 'Call failed'));
		} else {
			this.systemMsg(t('call.ended', 'Call ended'));
		}
		this.cleanup();
	}

	// Caller-side timeout (no answer)
	// 主叫超时无应答
	handleOutgoingTimeout() {
		if (this.state !== 'outgoing') return;
		this.systemMsg(t('call.no_answer', 'No one answered'));
		this.sendSignal(this.targetClientId, {
			action: 'end',
			callId: this.callId,
			reason: 'timeout'
		});
		this.cleanup();
	}

	// Remote member left the room
	// 对方离开房间
	onUserLeft(roomIdx, clientId) {
		if (this.state === 'idle' || roomIdx !== this.roomIdx || clientId !== this.targetClientId) {
			return;
		}
		this.systemMsg(`${this.targetName} ${t('call.user_left', 'left the call')}`);
		this.cleanup();
	}

	// User exited the room that holds the call
	// 退出包含通话的房间
	onRoomExit(roomIdx) {
		if (this.state === 'idle' || roomIdx !== this.roomIdx) {
			return;
		}
		this.hangup(true);
	}

	// User-initiated hangup
	// 用户主动挂断
	hangup(silent = false) {
		if (this.state === 'idle') return;
		if (!silent) {
			this.sendSignal(this.targetClientId, {
				action: 'end',
				callId: this.callId,
				reason: 'ended'
			});
			this.systemMsg(t('call.ended', 'Call ended'));
		}
		this.cleanup();
	}

	// Toggle microphone mute
	// 切换麦克风静音
	toggleMute() {
		if (!this.localStream) return;
		this.isMuted = !this.isMuted;
		this.localStream.getAudioTracks().forEach(track => {
			track.enabled = !this.isMuted;
		});
		this.updateMuteBtn();
	}

	// Toggle speaker output (only when the browser supports setSinkId)
	// 切换扬声器（仅在浏览器支持 setSinkId 时可用）
	async toggleSpeaker() {
		const audio = $id('call-remote-audio');
		if (!audio || typeof audio.setSinkId !== 'function') return;
		try {
			const next = this.speakerOn ? 'default' : 'communications';
			await audio.setSinkId(next);
			this.speakerOn = !this.speakerOn;
		} catch (error) {
			console.warn('setSinkId failed', error);
		}
		this.updateSpeakerBtn();
	}

	// -- WebRTC internals ----------------------------------------------------

	createPeerConnection() {
		const iceServers = (window.config && window.config.iceServers) || DEFAULT_ICE_SERVERS;
		const pc = new RTCPeerConnection({ iceServers });

		pc.onicecandidate = (event) => {
			if (event.candidate && this.state !== 'idle' && this.targetClientId) {
				this.sendSignal(this.targetClientId, {
					action: 'ice',
					callId: this.callId,
					candidate: event.candidate
				});
			}
		};

		pc.ontrack = (event) => {
			const audio = $id('call-remote-audio');
			if (audio && event.streams && event.streams[0]) {
				audio.srcObject = event.streams[0];
				audio.play().catch(() => {});
			}
		};

		pc.onconnectionstatechange = () => {
			if (!pc || pc !== this.peer) return;
			const state = pc.connectionState;
			if (state === 'connected') {
				this.enterInCall();
			} else if (state === 'failed') {
				this.systemMsg(t('call.failed', 'Call failed'));
				this.cleanup();
			} else if (state === 'disconnected') {
				this.setStatusText(t('call.reconnecting', 'Connection lost, reconnecting...'));
			}
		};

		return pc;
	}

	flushPendingCandidates() {
		if (!this.peer || !this.pendingCandidates || this.pendingCandidates.length === 0) return;
		this.pendingCandidates.forEach(candidate => {
			this.peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(error => {
				console.error('flushPendingCandidates failed', error);
			});
		});
		this.pendingCandidates = [];
	}

	enterInCall() {
		if (this.state === 'idle' || this.durationTimer) return;
		this.state = 'in-call';
		this.startTime = Date.now();
		const statusEl = $id('call-status');
		const update = () => {
			const seconds = Math.floor((Date.now() - this.startTime) / 1000);
			const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
			const ss = String(seconds % 60).padStart(2, '0');
			if (statusEl) statusEl.textContent = `${mm}:${ss}`;
		};
		update();
		this.durationTimer = setInterval(update, 1000);
	}

	setStatusText(text) {
		const statusEl = $id('call-status');
		if (statusEl) statusEl.textContent = text;
	}

	// Reset everything and hide the call UI
	// 清理所有资源并隐藏通话界面
	cleanup() {
		if (this.timeoutTimer) {
			clearTimeout(this.timeoutTimer);
			this.timeoutTimer = null;
		}
		if (this.durationTimer) {
			clearInterval(this.durationTimer);
			this.durationTimer = null;
		}
		this.stopRingtone();
		if (this.peer) {
			try {
				this.peer.onicecandidate = null;
				this.peer.ontrack = null;
				this.peer.onconnectionstatechange = null;
				this.peer.close();
			} catch (error) {
				console.error('close peer failed', error);
			}
			this.peer = null;
		}
		if (this.localStream) {
			this.localStream.getTracks().forEach(track => {
				try {
					track.stop();
				} catch (error) {
					console.error('stop track failed', error);
				}
			});
			this.localStream = null;
		}
		const audio = $id('call-remote-audio');
		if (audio) {
			audio.srcObject = null;
		}
		this.remoteAudio = null;
		this.pendingSdp = null;
		this.pendingCandidates = [];
		this.state = 'idle';
		this.targetClientId = null;
		this.targetName = '';
		this.callId = null;
		this.roomIdx = -1;
		this.isMuted = false;
		this.speakerOn = false;
		this.hideUI();
	}

	// -- UI ---------------------------------------------------------------

	ensureUI() {
		if (this.uiReady) return;
		this.uiReady = true;

		const overlay = document.createElement('div');
		overlay.id = 'call-overlay';
		overlay.className = 'call-overlay hidden';
		overlay.innerHTML = `
			<div class="call-card">
				<div class="call-avatar" id="call-avatar"></div>
				<div class="call-name" id="call-name"></div>
				<div class="call-room" id="call-room"></div>
				<div class="call-status" id="call-status"></div>
				<audio id="call-remote-audio" autoplay playsinline></audio>
				<div class="call-actions">
					<button class="call-action-btn call-accept-btn" id="call-accept-btn" type="button" title="Accept">
						<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
						</svg>
					</button>
					<button class="call-action-btn call-decline-btn" id="call-decline-btn" type="button" title="Decline">
						<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
						</svg>
					</button>
					<button class="call-action-btn call-mute-btn" id="call-mute-btn" type="button" title="Mute">
						<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"></path>
							<path d="M19 11a7 7 0 0 1-14 0"></path>
							<line x1="12" y1="18" x2="12" y2="23"></line>
							<line x1="8" y1="23" x2="16" y2="23"></line>
						</svg>
					</button>
					<button class="call-action-btn call-speaker-btn" id="call-speaker-btn" type="button" title="Speaker">
						<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
							<path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
						</svg>
					</button>
					<button class="call-action-btn call-hangup-btn" id="call-hangup-btn" type="button" title="Hang up">
						<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
						</svg>
					</button>
				</div>
			</div>
		`;
		document.body.appendChild(overlay);

		$id('call-accept-btn').onclick = () => this.acceptIncoming();
		$id('call-decline-btn').onclick = () => this.declineIncoming();
		$id('call-mute-btn').onclick = () => this.toggleMute();
		$id('call-speaker-btn').onclick = () => this.toggleSpeaker();
		$id('call-hangup-btn').onclick = () => this.hangup();

		// Hide the speaker button when the browser cannot switch audio output
		const speakerBtn = $id('call-speaker-btn');
		if (speakerBtn && !(typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype)) {
			speakerBtn.style.display = 'none';
		}
	}

	showUI(mode) {
		const overlay = $id('call-overlay');
		if (!overlay) return;
		removeClass(overlay, 'hidden');
		overlay.classList.remove('mode-incoming', 'mode-active');
		overlay.classList.add(mode === 'incoming' ? 'mode-incoming' : 'mode-active');

		const nameEl = $id('call-name');
		if (nameEl) nameEl.textContent = this.targetName || '';

		const avatarEl = $id('call-avatar');
		if (avatarEl) avatarEl.innerHTML = this.avatarSvg(this.targetName);

		const room = this.getRoomAt(this.roomIdx);
		const roomEl = $id('call-room');
		if (roomEl) roomEl.textContent = room && room.roomName ? `#${room.roomName}` : '';

		let status = t('call.connecting', 'Connecting...');
		if (mode === 'incoming') {
			status = t('call.incoming_call', 'Incoming voice call');
		} else if (mode === 'outgoing') {
			status = t('call.calling', 'Calling...');
		}
		this.setStatusText(status);
		this.updateMuteBtn();
		this.updateSpeakerBtn();
	}

	hideUI() {
		const overlay = $id('call-overlay');
		if (overlay) addClass(overlay, 'hidden');
	}

	updateMuteBtn() {
		const btn = $id('call-mute-btn');
		if (!btn) return;
		if (this.isMuted) {
			addClass(btn, 'active');
			btn.title = t('call.unmute', 'Unmute');
			btn.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<line x1="1" y1="1" x2="23" y2="23"></line>
				<path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"></path>
				<path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
				<line x1="12" y1="19" x2="12" y2="23"></line>
				<line x1="8" y1="23" x2="16" y2="23"></line>
			</svg>`;
		} else {
			removeClass(btn, 'active');
			btn.title = t('call.mute', 'Mute');
			btn.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"></path>
				<path d="M19 11a7 7 0 0 1-14 0"></path>
				<line x1="12" y1="18" x2="12" y2="23"></line>
				<line x1="8" y1="23" x2="16" y2="23"></line>
			</svg>`;
		}
	}

	updateSpeakerBtn() {
		const btn = $id('call-speaker-btn');
		if (!btn) return;
		if (this.speakerOn) {
			addClass(btn, 'active');
			btn.title = t('call.speaker_on', 'Speaker on');
		} else {
			removeClass(btn, 'active');
			btn.title = t('call.speaker', 'Speaker');
		}
	}

	avatarSvg(name) {
		try {
			const svg = createAvatarSVG(name || '');
			return svg.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
		} catch (error) {
			console.error('avatarSvg failed', error);
			return '';
		}
	}

	getMyName(roomIdx) {
		const room = this.getRoomAt(roomIdx);
		return room && room.myUserName ? room.myUserName : '';
	}

	// -- ringtone ----------------------------------------------------------

	startRingtone(kind) {
		this.stopRingtone();
		try {
			const ctx = new (window.AudioContext || window.webkitAudioContext)();
			this.ringtone = ctx;
			const resumeOnGesture = () => {
				if (ctx.state === 'suspended') ctx.resume().catch(() => {});
				document.removeEventListener('pointerdown', resumeOnGesture);
			};
			document.addEventListener('pointerdown', resumeOnGesture);

			if (kind === 'ring') {
				this.ringInterval = setInterval(() => {
					this.playBeep(ctx, 800, 0.2, 0);
					this.playBeep(ctx, 1050, 0.2, 0.28);
				}, 1500);
			} else {
				this.ringInterval = setInterval(() => {
					this.playBeep(ctx, 425, 0.16, 0);
					this.playBeep(ctx, 425, 0.16, 0.3);
				}, 2600);
			}
		} catch (error) {
			console.error('startRingtone failed', error);
		}
	}

	stopRingtone() {
		if (this.ringInterval) {
			clearInterval(this.ringInterval);
			this.ringInterval = null;
		}
		if (this.ringtone) {
			try {
				this.ringtone.close();
			} catch (error) {
				console.error('close ringtone failed', error);
			}
			this.ringtone = null;
		}
	}

	playBeep(ctx, freq, duration, delay = 0) {
		const t0 = ctx.currentTime + delay;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'sine';
		osc.frequency.value = freq;
		osc.connect(gain);
		gain.connect(ctx.destination);
		gain.gain.setValueAtTime(0.0001, t0);
		gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
		osc.start(t0);
		osc.stop(t0 + duration + 0.02);
	}
}

// Singleton call manager
// 全局通话管理器单例
export const callManager = new CallManager();
export { CallManager };
