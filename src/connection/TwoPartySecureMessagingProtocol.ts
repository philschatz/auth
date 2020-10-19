﻿import * as base64 from '@stablelib/base64'
import msgpack from 'msgpack-lite'
import { asymmetric } from '/crypto'

// implementation of 2-Way Secure Messaging (2SM) Protocol
// described in "Key Agreement for Decentralized Secure Group Messaging with Strong Security Guarantees"
// by Matthew Weidner, Martin Kleppmann, Daniel Hugenroth, and Alastair R. Beresford
// https://eprint.iacr.org/2020/1281
// reference implementation in java: https://github.com/trvedata/key-agreement
export class TwoPartySecureMessagingProtocol {
  private mySks: string[]
  private receivedSk: string
  private nextIndex: number
  private otherPk: string
  private otherPkSender: MeOrOther
  private otherPkIndex: number

  constructor(sk: string, pk: string) {
    this.mySks = [sk]
    this.receivedSk = EMPTY
    this.nextIndex = 1
    this.otherPk = pk
    this.otherPkSender = OTHER
    this.otherPkIndex = 0
  }

  send(message: string) {
    const myNewKeyPair = asymmetric.keyPair()
    const otherNewKeyPair = asymmetric.keyPair()

    this.mySks[this.nextIndex] = myNewKeyPair.secretKey

    const secret = pack({
      message,
      otherNewSk: otherNewKeyPair.secretKey,
      nextIndex: this.nextIndex,
      myNewPk: myNewKeyPair.publicKey,
    } as TwoPartyPlaintext)

    const encryptedPayload = asymmetric.encryptWithEphemeralKey({
      secret,
      recipientPublicKey: this.otherPk,
    })

    const msg = pack({
      encryptedPayload,
      keySender: this.otherPkSender,
      keyIndex: this.otherPkIndex,
    } as TwoPartyMessage)

    this.nextIndex += 1

    this.otherPk = otherNewKeyPair.publicKey
    this.otherPkSender = ME
    this.otherPkIndex = 0

    return msg
  }

  receive(cipher: string) {
    const { encryptedPayload, keySender, keyIndex } = unpack(cipher) as TwoPartyMessage

    let sk: string
    if (keySender === OTHER) {
      sk = this.mySks[keyIndex]
      if (sk === undefined) throw new Error('A given cipher can only be decrypted once')
      for (let i = 0; i <= keyIndex; i++) delete this.mySks[i]
    } else {
      sk = this.receivedSk
    }

    const decrypted = asymmetric.decryptWithEphemeralKey({
      cipher: encryptedPayload,
      recipientSecretKey: sk,
    })
    const { message, otherNewSk, nextIndex, myNewPk } = unpack(decrypted) as TwoPartyPlaintext

    this.receivedSk = otherNewSk

    this.otherPk = myNewPk
    this.otherPkSender = OTHER
    this.otherPkIndex = nextIndex

    return message
  }
}

const pack = (o: any) => base64.encode(msgpack.encode(o))
const unpack = (s: string) => msgpack.decode(base64.decode(s))

const EMPTY = ''
const ME = 'me'
const OTHER = 'other'

type MeOrOther = typeof ME | typeof OTHER

interface TwoPartyMessage {
  encryptedPayload: string // ciphertext
  keySender: MeOrOther // senderOtherPkSender
  keyIndex: number // receiverPkIndex
}

interface TwoPartyPlaintext {
  message: string // appPlaintext
  otherNewSk: string // receiverNewSk
  nextIndex: number // senderNewPkIndex
  myNewPk: string // senderNewPk
}