﻿import { MemberContext } from '/context'
import { Base64, UnixTimestamp, ValidationResult } from '/util/types'

/** A hash-chained array of signed links */
export type SignatureChain<T extends SignedLink = SignedLink> = T[]

/** The full link, consisting of a body and a signature link */
export interface SignedLink<T = LinkBody> {
  /** The part of the link that is signed & hashed */
  body: T
  /** hash of this link */
  hash: Base64

  /** The signature block (signature, name, and key) */
  signed: {
    /** NaCL-generated base64 signature of the link's body */
    signature: Base64
    /** The username (or ID or email) of the person signing the link */
    userName: string
    /** The public half of the key used to sign the link, in base64 encoding */
    key: Base64
  }
}

/** The part of the link that is signed */
export interface LinkBody {
  /** Label identifying the type of action this link represents */
  type: 'ROOT' | unknown
  /** Payload of the action */
  payload: unknown
  /** Context in which this link was authored (user, device, client) */
  context: MemberContext
  /** Unix timestamp on device that created this link */
  timestamp: UnixTimestamp
  /** Unix time after which this link should be ignored */
  expires?: UnixTimestamp
  /** hash of previous link */
  prev: Base64 | null
  /** index of this link within signature chain */
  index: number
}

/** User-writable fields of a link (omits fields that are added automatically) */
export type PartialLinkBody<T extends LinkBody = LinkBody> = Pick<T, 'type' | 'payload'>

export type Validator = (currentLink: SignedLink, prevLink?: SignedLink) => ValidationResult

export type ValidatorSet = {
  [key: string]: Validator
}
