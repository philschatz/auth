﻿import { Key, Base64, UnixTimestamp, SemVer } from '/types'
import { Keyset } from 'keys'

export interface LocalUser {
  name: string
  keys: Keyset
}

export type SignatureChain = SignedLink[]

export interface SignedLink {
  body: LinkBody
  signed: {
    signature: Base64
    name: string
    key: Base64
  }
}

export interface LinkBodyBase {
  type: LinkType
  payload?: any

  // context
  user: string
  device?: Device
  client?: Client
  timestamp: UnixTimestamp // Unix timestamp on device that created this block

  // hash of previous block
  prev?: Base64

  // Unix time when this block should be automatically revoked
  expires?: UnixTimestamp

  // index of this block within signature chain
  index: number
}

export enum LinkType {
  ROOT,
  ADD_MEMBER,
  INVITE,
  ADD_DEVICE,
  ADD_ROLE,
  CHANGE_MEMBERSHIP,
  REVOKE,
  ROTATE,
}

export type Member = {
  name: string
  encryptionKey: Base64
  signingKey: Base64
  generation: number // increments when keys are rotated
}

// export interface RootLink extends LinkBodyBase {
//   type: LinkType.ROOT
//   payload: {
//     team: {
//       name: string
//       rootUser: Member
//     }
//   }
//   prev: null
//   index: 0
// }

export type LinkBody = LinkBodyBase

export enum DeviceType {
  desktop,
  laptop,
  tablet,
  mobile,
  bot,
  server,
  other,
}

export interface Device {
  id?: Base64
  name: string
  type: DeviceType
}

export interface Client {
  name: string
  version: SemVer
}
