import './style.css';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAG-vVsFLnPfFupYN39EtoMWCcXCMcP4y0",
  authDomain: "webrtc-demo-97583.firebaseapp.com",
  projectId: "webrtc-demo-97583",
  storageBucket: "webrtc-demo-97583.appspot.com",
  messagingSenderId: "911858260221",
  appId: "1:911858260221:web:a8d5fd20f71b6a3c474694"
};

// Firebase initialization
const firebaseApp = firebase.initializeApp(firebaseConfig);

// Firestore initialization
const firestore = firebaseApp.firestore();

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;
let peerId = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// Firestore collections
const roomsCollection = firestore.collection('rooms');
let roomDoc = null;
let offerCandidates = null;
let answerCandidates = null;
const peersCollection = firestore.collection('peers');

// Constant room id
const roomId = '123456';

// Setup media sources
webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  peerId = Math.random().toString(36).substring(2); // Generate a unique peer ID
  callButton.disabled = false;
  webcamButton.disabled = true;
};

// Create an offer
callButton.onclick = async () => {
  roomDoc = roomsCollection.doc(roomId);
  offerCandidates = roomDoc.collection('offerCandidates');
  answerCandidates = roomDoc.collection('answerCandidates');

  // Add peer id to Firebase
  await peersCollection.add({ peerId });

  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await roomDoc.set({ offer, callerId: peerId });

  roomDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
};

// Answer the call
answerButton.onclick = async () => {
  roomDoc = roomsCollection.doc(roomId);
  offerCandidates = roomDoc.collection('offerCandidates');
  answerCandidates = roomDoc.collection('answerCandidates');

  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const callData = (await roomDoc.get()).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await roomDoc.update({ answer, answererId: peerId });

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};

hangupButton.onclick = () => {
  pc.close();

  localStream.getTracks().forEach((track) => {
    track.stop();
  });

  webcamVideo.srcObject = null;
  remoteVideo.srcObject = null;

  hangupButton.disabled = true;
  webcamButton.disabled = false;
  callButton.disabled = true;

  // Remove peer id from Firebase
  peersCollection.where('peerId', '==', peerId).get()
    .then((snapshot) => {
      snapshot.forEach((doc) => {
        doc.ref.delete();
      });
    });

  roomDoc.set({ callerId: null, answererId: null });
};

// Check if there are any peer ids
peersCollection.onSnapshot((snapshot) => {
  if (snapshot.empty) {
    answerButton.disabled = true;
  } else {
    answerButton.disabled = false;
  }
});
