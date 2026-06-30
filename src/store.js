// Data layer. Two backends behind one interface:
//   - Firebase Firestore (per-user) when firebaseReady — used in production / when configured.
//   - Local Express server (/api/tracks) otherwise — used for local dev without Firebase.
//
// Interface:
//   loadTracks(uid)            -> Promise<Track[]>   (seeds defaults on first use)
//   saveTrack(uid, track)      -> Promise<void>
//   createTrack(uid, track)    -> Promise<void>
//   deleteTrack(uid, trackId)  -> Promise<void>
import { firebaseReady, db } from './firebase.js'
import {
  collection, doc, getDocs, setDoc, deleteDoc,
} from 'firebase/firestore'

import python from '../data/python.json'
import backend from '../data/backend.json'
import summerCourse from '../data/summer-course.json'
import internship from '../data/internship.json'

export const DEFAULT_TRACKS = [python, backend, summerCourse, internship]

// Strip transient UI-only keys (e.g. _collapsed) before persisting.
function clean(obj) {
  return JSON.parse(JSON.stringify(obj, (k, v) => (k.startsWith('_') ? undefined : v)))
}

// ---- Firestore backend ----
function tracksCol(uid) {
  return collection(db, 'users', uid, 'tracks')
}

async function fsLoad(uid) {
  const snap = await getDocs(tracksCol(uid))
  if (snap.empty) {
    // First sign-in: seed the default tracks.
    await Promise.all(DEFAULT_TRACKS.map((t) => setDoc(doc(tracksCol(uid), t.id), clean(t))))
    return [...DEFAULT_TRACKS].sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
  }
  const tracks = snap.docs.map((d) => d.data())
  tracks.sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
  return tracks
}

async function fsSave(uid, track) {
  await setDoc(doc(tracksCol(uid), track.id), clean(track))
}

async function fsCreate(uid, track) {
  await setDoc(doc(tracksCol(uid), track.id), clean(track))
}

async function fsDelete(uid, trackId) {
  await deleteDoc(doc(tracksCol(uid), trackId))
}

// ---- Local Express backend (dev fallback) ----
async function apiLoad() {
  const r = await fetch('/api/tracks')
  return r.json()
}
async function apiSave(track) {
  await fetch(`/api/tracks/${track.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clean(track)),
  })
}
async function apiCreate(track) {
  await fetch('/api/tracks', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clean(track)),
  })
}
async function apiDelete(trackId) {
  await fetch(`/api/tracks/${trackId}`, { method: 'DELETE' })
}

// ---- Public interface ----
export const usingFirestore = firebaseReady

export function loadTracks(uid) {
  return firebaseReady ? fsLoad(uid) : apiLoad()
}
export function saveTrack(uid, track) {
  return firebaseReady ? fsSave(uid, track) : apiSave(track)
}
export function createTrack(uid, track) {
  return firebaseReady ? fsCreate(uid, track) : apiCreate(track)
}
export function deleteTrack(uid, trackId) {
  return firebaseReady ? fsDelete(uid, trackId) : apiDelete(trackId)
}
