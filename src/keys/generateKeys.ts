﻿import nacl from 'tweetnacl'
import { hash, stretch } from '/crypto'
import { randomKey } from '/keys/randomKey'
import { KeysetWithSecrets } from '/keys/types'
import { HashPurpose, Key, keypairToBase64 } from '/lib'

/**
 * Generates a full set of per-user keys from a single 32-byte secret, roughly following the
 * procedure outlined in the [Keybase docs on Per-User Keys](http://keybase.io/docs/teams/puk).
 *
 * @param seed A 32-byte secret key used to derive all other keys. This key should be randomly
 * generated to begin with, then stored in the device's secure storage. It should never leave the
 * original device except in encrypted form.
 * @returns A `Keyset` consisting of a keypair for signing and a keypair for asymmetric encryption.
 * (The secret half of the encryption key can also be used for symmetric encryption.)
 */
export const generateKeys = (seed: string = randomKey()): KeysetWithSecrets => {
  const stretchedSeed = stretch(seed)
  return {
    seed,
    signature: deriveSignatureKeys(stretchedSeed),
    encryption: deriveEncryptionKeys(stretchedSeed),
  }
}

// private

const deriveSignatureKeys = (secretKey: Key) => {
  const hashKey = HashPurpose.Signature
  const { keyPair } = nacl.sign
  const derivedSeed = hash(hashKey, secretKey).slice(0, 32)
  const keys = keyPair.fromSeed(derivedSeed)
  return keypairToBase64(keys)
}

const deriveEncryptionKeys = (secretKey: Key) => {
  const hashKey = HashPurpose.Encryption
  const { keyPair, secretKeyLength } = nacl.box
  const derivedSecretKey = hash(hashKey, secretKey).slice(0, secretKeyLength)
  const keys = keyPair.fromSecretKey(derivedSecretKey)
  return keypairToBase64(keys)
}