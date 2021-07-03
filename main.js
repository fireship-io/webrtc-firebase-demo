import './style.css';

import firebase from 'firebase/app';
import 'firebase/firestore';
import 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyAMlK4Jz60lEYnZvcFzGo-JqOPQ-Q2oXP0",
  authDomain: "web-rtc-b2af7.firebaseapp.com",
  databaseURL: "https://web-rtc-b2af7-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "web-rtc-b2af7",
  storageBucket: "web-rtc-b2af7.appspot.com",
  messagingSenderId: "593149952785",
  appId: "1:593149952785:web:1867797b5db06dac09c2b0"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();
const database = firebase.database();


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

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

//
const databaseID = document.getElementById('databaseID')
// 1. Setup media sources

webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

// 2. Create an offer
callButton.onclick = async () => {
  // Reference Firestore collections for signaling
  // const callDoc = firestore.collection('calls').doc();
  // const offerCandidates = callDoc.collection('offerCandidates');
  // const answerCandidates = callDoc.collection('answerCandidates');

  // database test below
  const callRef = database.ref('calls').push()
  const offerCandidates2 = callRef.child('offerCandidates')
  const answerCandidates2 = callRef.child('answerCandidates')

  database.ref("calls").on("child_added", (snapshot) => {
    databaseID.value = snapshot.key
  })

  // callInput.value = callDoc.id;// add value from snapshot here

  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    // event.candidate && offerCandidates.add(event.candidate.toJSON());
    event.candidate && offerCandidates2.push(event.candidate.toJSON()) // database
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  // await callDoc.set({ offer });
  await callRef.child('protocols').set({ offer }); // setting in database

  // Listen for remote answer
  // callDoc.onSnapshot((snapshot) => {
  //   const data = snapshot.data();
  //   if (!pc.currentRemoteDescription && data?.answer) {
  //     const answerDescription = new RTCSessionDescription(data.answer);
  //     pc.setRemoteDescription(answerDescription);
  //   }
  // });

  // database implemented
  callRef.child('protocols').on('child_added', (snapshot) => {
    const snapData = snapshot.val()
    if (!pc.currentRemoteDescription && snapData.type === 'answer') {
      const answerDescription = new RTCSessionDescription(snapData);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  // answerCandidates.onSnapshot((snapshot) => {
  //   snapshot.docChanges().forEach((change) => {
  //     if (change.type === 'added') {
  //       console.log(change.doc.data());
  //       const candidate = new RTCIceCandidate(change.doc.data());
  //       pc.addIceCandidate(candidate);
  //     }
  //   });
  // });

  // database implemented
  answerCandidates2.on('child_added', (snapshot) => {
    const candidate = new RTCIceCandidate(snapshot.val());
    pc.addIceCandidate(candidate);
  })

  hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  // const callId = callInput.value;
  // const callDoc = firestore.collection('calls').doc(callId);
  // const answerCandidates = callDoc.collection('answerCandidates');
  // const offerCandidates = callDoc.collection('offerCandidates');

  // database variables below
  const callIdDatabase = databaseID.value
  const callRef = database.ref('calls').child(callIdDatabase);
  const answerCandidates2 = callRef.child('answerCandidates');
  const offerCandidates2 = callRef.child('offerCandidates');
  // end database variables

  pc.onicecandidate = (event) => {
    // event.candidate && answerCandidates.add(event.candidate.toJSON());
    event.candidate && answerCandidates2.push(event.candidate.toJSON());
  };

  // const callData = (await callDoc.get()).data();

  // database
  const callData = (await callRef.child('protocols').get()).val();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  // await callDoc.update({ answer });
  await callRef.child('protocols').update({ answer }); // setting in database

  // offerCandidates.onSnapshot((snapshot) => {
  //   snapshot.docChanges().forEach((change) => {
  //     console.log(change);
  //     if (change.type === 'added') {
  //       let data = change.doc.data();
  //       // console.log(data)
  //       pc.addIceCandidate(new RTCIceCandidate(data));
  //     }
  //   });
  // });

  offerCandidates2.on('child_added', (snapshot) => {
    pc.addIceCandidate(new RTCIceCandidate(snapshot.val()));
    console.log("ICE candidate added")
  })


};
