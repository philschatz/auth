﻿import { symmetric } from '/crypto'
import { deriveId } from '/invitation/deriveId'
import { Invitation, InvitationPayload } from '/invitation/types'
import { deriveKeys, KeysetWithSecrets } from '/keys'

export const IKEY_LENGTH = 16

// A loosely adapted implementation of Keybase's Seitan Token v2 exchange protocol. Step numbers
// refer to this page: http://keybase.io/docs/teams/seitan_v2

/**
 * Returns an an invitation to public post on the team's signature chain.
 * @param teamKeys The global team keys (Alice obtains these from the appropriate lockbox)
 * @param userName Bob's username
 *
 * @param secretKey A randomly generated secret (Step 1a) to be passed to Bob via a side channel
 * @see newSecretKey
 */
export const create = (args: InvitationArgs): Invitation => {
  const { teamKeys, userName, roles = [], secretKey } = args
  const generation = teamKeys.generation || 0

  // ## Step 1b, 1c
  // Stretch the key and hash it to obtain an invitation ID (Keybase docs: `inviteID`)
  const id = deriveId(secretKey)

  // ## Step 1d
  // Generate a signing keypair for Bob to use to verify that he knows the secret key. This keypair
  // is also derived from the secret key, so Bob can generate it independently.
  const { publicKey } = deriveKeys(secretKey).signature

  // ## Step 2a
  // Encrypt Bob's username and roles so that we don't leak that information in the public signature
  // chain. We also include the public half of the signature keyset, which will be used to verify
  // Bob's proof of invitation.
  const payload: InvitationPayload = { userName, roles, publicKey }
  const body = symmetric.encrypt(payload, teamKeys.symmetric.key)

  // ## Step 2b
  // We put it all together to create the invitation.
  const invitation: Invitation = { id, encryptedPayload: body, generation }
  return invitation
}

interface InvitationArgs {
  teamKeys: KeysetWithSecrets
  userName: string
  roles?: string[]
  secretKey: string
}