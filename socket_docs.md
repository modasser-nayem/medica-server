# Medica WebSockets (Socket.io) Documentation

This document describes the real-time events, authentication, payloads, and communication workflow for WebSockets in **Medica Health Care**.

---

## 1. Connection & Authentication

The socket server is integrated directly into the core HTTPS server and is powered by **Socket.io**.

* **Base URL**: `ws://localhost:5050` (or `http://localhost:5050` with fallback polling)
* **Path**: `/socket.io/` (default Socket.io path)
* **Auth Requirement**: You must pass the JWT Access Token either in the `auth` handshake object or the `query` parameters.

### Connection Options Example (Client-side)
```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:5050", {
  auth: {
    token: "YOUR_JWT_ACCESS_TOKEN"
  }
});
```

### Authentication Failure
If the token is invalid, expired, or missing, the server rejects the connection with one of the following error messages:
* `"Authentication error: Token is required"`
* `"Authentication error: Invalid token"`
* `"Authentication error: Token verification failed"`

---

## 2. Server Rooms

Upon successful connection, the server automatically assigns the user to rooms:
1. **User Room (`userId`)**: The socket automatically joins a room matching the user's primary database ID. This is used to deliver user-specific events like incoming calls.
2. **Chat Thread Room (`threadId`)**: Clients manually join or leave these rooms to stream real-time chat histories for specific consultations.

---

## 3. Real-Time Events Directory

### 🟢 Status Events

#### `user_status` (Broadcasted by Server)
Sent to all connected clients when a user's connection status changes.
* **Payload Format**:
  ```json
  {
    "userId": "d748f219-c6e3-4c9f-8de4-cb9de9ff1a02",
    "status": "online" // or "offline"
  }
  ```

---

### 💬 Chat & Messaging Events

#### `join_thread` (Client $\rightarrow$ Server)
Instructs the server to join the user's socket to a specific chat room.
* **Payload Format**:
  ```json
  {
    "threadId": "8f8b3dfc-0a25-4c07-b352-87a1d1234cde"
  }
  ```

#### `leave_thread` (Client $\rightarrow$ Server)
Instructs the server to remove the user's socket from a specific chat room.
* **Payload Format**:
  ```json
  {
    "threadId": "8f8b3dfc-0a25-4c07-b352-87a1d1234cde"
  }
  ```

#### `send_message` (Client $\rightarrow$ Server)
Sends a text or file message to the patient or doctor.
> [!IMPORTANT]
> Messaging is strictly time-gated. A message will only be sent and saved if there is currently a **CONFIRMED** appointment between this patient and doctor, and the current local server time falls within the appointment's start and end times.
* **Payload Format**:
  ```json
  {
    "recipientId": "73e72e18-e21b-417d-94cb-5ff89e0231cf",
    "text": "Hello Dr. Smith, I have uploaded my reports.",
    "attachment": "https://res.cloudinary.com/.../report.pdf", // optional
    "attachmentType": "FILE" // optional (TEXT, IMAGE, FILE, AUDIO, VIDEO)
  }
  ```

#### `message_sent` (Server $\rightarrow$ Sender)
Acknowledgment emitted directly back to the message sender indicating successful storage and delivery.
* **Payload Format**:
  ```json
  {
    "id": "e2baefc9-2708-412e-862d-cf237a6a4387",
    "threadId": "8f8b3dfc-0a25-4c07-b352-87a1d1234cde",
    "senderId": "d748f219-c6e3-4c9f-8de4-cb9de9ff1a02",
    "consultationId": "9b12e345-0e17-48df-9c12-348f9ce1248a",
    "type": "TEXT",
    "text": "Hello Dr. Smith, I have uploaded my reports.",
    "attachment": null,
    "isRead": false,
    "createdAt": "2026-06-11T03:30:00.000Z",
    "updatedAt": "2026-06-11T03:30:00.000Z",
    "sender": {
      "id": "d748f219-c6e3-4c9f-8de4-cb9de9ff1a02",
      "name": "John Doe",
      "profileImage": "https://cloudinary.com/.../profile.jpg"
    }
  }
  ```

#### `message_error` (Server $\rightarrow$ Sender)
Emitted only to the sender if a message fails (e.g. out of appointment time window).
* **Payload Format**:
  ```json
  {
    "error": "Messaging is only allowed during your active booked appointment time slot."
  }
  ```

#### `new_message` (Server $\rightarrow$ Thread Room Members)
Broadcasted to all sockets in the `threadId` room when a new message is successfully created.
* **Payload Format**:
  Same as `message_sent` payload above.

#### `seen_messages` (Client $\rightarrow$ Server)
Instructs the server to mark all unread messages received by the user in this thread as read.
* **Payload Format**:
  ```json
  {
    "threadId": "8f8b3dfc-0a25-4c07-b352-87a1d1234cde"
  }
  ```

#### `messages_seen` (Server $\rightarrow$ Thread Room Members)
Broadcasted to the thread room to notify that messages have been read by a recipient.
* **Payload Format**:
  ```json
  {
    "threadId": "8f8b3dfc-0a25-4c07-b352-87a1d1234cde",
    "readerId": "73e72e18-e21b-417d-94cb-5ff89e0231cf"
  }
  ```

#### `typing` / `stop_typing` (Client $\rightarrow$ Server)
Used to display real-time typing indicators in the user interface.
* **Payload Format**:
  ```json
  {
    "threadId": "8f8b3dfc-0a25-4c07-b352-87a1d1234cde",
    "recipientId": "73e72e18-e21b-417d-94cb-5ff89e0231cf"
  }
  ```

#### `user_typing` / `user_stop_typing` (Server $\rightarrow$ Recipient Sockets)
Dispatched to all active socket connections of the target user.
* **Payload Format**:
  ```json
  {
    "threadId": "8f8b3dfc-0a25-4c07-b352-87a1d1234cde",
    "senderId": "d748f219-c6e3-4c9f-8de4-cb9de9ff1a02"
  }
  ```

---

### 📞 WebRTC & Calling Signaling Events

These events coordinate call invitation, acceptance, rejection, and WebRTC connection metadata between peers.

#### `accept_call` (Client $\rightarrow$ Server)
Informs the server that the recipient has accepted the incoming call.
* **Payload Format**:
  ```json
  {
    "callId": "c8b4dfc9-2708-412e-862d-cf237a6a4387",
    "callerId": "d748f219-c6e3-4c9f-8de4-cb9de9ff1a02"
  }
  ```

#### `call_accepted` (Server $\rightarrow$ Caller Room)
Notifies the original caller that the recipient accepted the call.
* **Payload Format**:
  ```json
  {
    "callId": "c8b4dfc9-2708-412e-862d-cf237a6a4387",
    "acceptedBy": "73e72e18-e21b-417d-94cb-5ff89e0231cf"
  }
  ```

#### `reject_call` (Client $\rightarrow$ Server)
Informs the server that the recipient has rejected the incoming call.
* **Payload Format**:
  ```json
  {
    "callId": "c8b4dfc9-2708-412e-862d-cf237a6a4387",
    "callerId": "d748f219-c6e3-4c9f-8de4-cb9de9ff1a02"
  }
  ```

#### `call_rejected` (Server $\rightarrow$ Caller Room)
Notifies the original caller that the recipient rejected the call.
* **Payload Format**:
  ```json
  {
    "callId": "c8b4dfc9-2708-412e-862d-cf237a6a4387",
    "rejectedBy": "73e72e18-e21b-417d-94cb-5ff89e0231cf"
  }
  ```

#### `end_call` (Client $\rightarrow$ Server)
Relays peer-to-peer hangup signal directly to the other party's sockets.
* **Payload Format**:
  ```json
  {
    "callId": "c8b4dfc9-2708-412e-862d-cf237a6a4387",
    "recipientId": "73e72e18-e21b-417d-94cb-5ff89e0231cf"
  }
  ```

#### `call_ended` (Server $\rightarrow$ Recipient Room)
Informs the target recipient that the call has been ended by the other peer.
* **Payload Format**:
  ```json
  {
    "callId": "c8b4dfc9-2708-412e-862d-cf237a6a4387",
    "endedBy": "d748f219-c6e3-4c9f-8de4-cb9de9ff1a02"
  }
  ```

#### `call_signal` (Client $\rightarrow$ Server)
Relays generic ICE Candidate, SDP Offer, or SDP Answer signals between caller and recipient.
* **Payload Format**:
  ```json
  {
    "to": "73e72e18-e21b-417d-94cb-5ff89e0231cf",
    "signal": {
      "type": "offer", // or candidate data
      "sdp": "..."
    },
    "callId": "c8b4dfc9-2708-412e-862d-cf237a6a4387"
  }
  ```

#### `call_signal` (Server $\rightarrow$ Recipient Room)
Relays the signal event received from `from` user to the `to` user's sockets.
* **Payload Format**:
  ```json
  {
    "from": "d748f219-c6e3-4c9f-8de4-cb9de9ff1a02",
    "signal": {
      "type": "offer",
      "sdp": "..."
    },
    "callId": "c8b4dfc9-2708-412e-862d-cf237a6a4387"
  }
  ```
