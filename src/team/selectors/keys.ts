﻿import memoize from 'fast-memoize'
import { KeyMetadata, KeysetWithSecrets } from '/keyset'
import { open } from '/lockbox'
import { TeamState } from '/team/types'
import { User } from '/user'
import { Optional } from '/util'

export const keys = (
  state: TeamState,
  currentUser: User,
  scope: Optional<KeyMetadata, 'generation'>
) => {
  const { type, name, generation: maybeGeneration } = scope

  const keysFromLockboxes = getKeyMap(state, currentUser)
  const keys = keysFromLockboxes[type] && keysFromLockboxes[type][name]
  if (!keys) throw new Error(`Keys not found for ${type.toLowerCase()} ${name}`)

  const generation = maybeGeneration === undefined ? keys.length - 1 : maybeGeneration // use latest generation by default
  return keys[generation]
}

/** Returns all keysets from the current user's lockboxes in a structure that looks like this:
 * ```js
 * {
 *    TEAM: {
 *      TEAM: Keyset[], // <- all keys starting with generation 0
 *    ROLE: {
 *      admin: Keyset[]
 *      managers: Keyset[]
 *    },
 * }
 * ```
 */
const getKeyMap = memoize(
  (state: TeamState, currentUser: User): KeyMap => {
    const usersOwnKeys = currentUser.keyHistory || [currentUser.keys] // if there's no history, just use the keys we have
    const allVisibleKeys = usersOwnKeys.flatMap(keys => getDerivedKeys(state, keys))
    return allVisibleKeys.reduce(organizeKeysIntoMap, {})
  }
)

const getDerivedKeys = (state: TeamState, keyset: KeysetWithSecrets): KeysetWithSecrets[] => {
  const { lockboxes } = state
  const publicKey = keyset.encryption.publicKey
  const lockboxesICanUnlock = lockboxes.filter(({ recipient }) => recipient.publicKey === publicKey)
  const keysets = lockboxesICanUnlock.map(lockbox => open(lockbox, keyset))
  const derivedKeysets = keysets.flatMap(keyset => getDerivedKeys(state, keyset))
  return [...keysets, ...derivedKeysets]
}

const organizeKeysIntoMap = (result: KeyMap, keys: KeysetWithSecrets) => {
  const { type, name, generation } = keys
  const keysetsForScope = result[type] || {}
  const keysetHistory = keysetsForScope[name] || []
  keysetHistory[generation] = keys
  return {
    ...result,
    [type]: {
      ...keysetsForScope,
      [name]: keysetHistory,
    },
  } as KeyMap
}

interface KeyMap {
  [type: string]: {
    [name: string]: KeysetWithSecrets[]
  }
}
