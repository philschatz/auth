﻿import { User } from './types'
import { redactDevice } from '/device'
import { redactKeys } from '/keyset'
import { Member } from '/member'

export const redactUser = (user: User): Member => {
  const { userName } = user
  return {
    userName,
    keys: redactKeys(user.keys),
    roles: [],
    devices: [redactDevice(user.device)],
  } as Member
}
