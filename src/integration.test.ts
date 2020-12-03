﻿import { pause } from './util'
import { Connection, ConnectionState, InitialContext } from '/connection'
import { LocalUserContext } from '/context'
import { Device, redactDevice } from '/device'
import { ADMIN } from '/role'
import * as teams from '/team'
import { Team } from '/team'
import { User } from '/user'
import { arrayToMap } from '/util/arrayToMap'
import debug from '/util/debug'
import { alice, bob, charlie, dwight, joinTestChannel, TestChannel } from '/util/testing'
import '/util/testing/expect/toBeValid'

const log = debug(`taco`)

interface UserStuff {
  userName: string
  user: User
  context: LocalUserContext
  device: Device
  team: Team
  connectionContext: InitialContext
  connection: Record<string, Connection>
  getState: (u: string) => any
}

beforeAll(() => {
  log.clear()
})

describe('integration', () => {
  beforeEach(() => log.header(testName()))

  const setup = (userNames: string[] = []) => {
    const allTestUsers: Record<string, User> = { alice, bob, charlie, dwight }
    const getUserContext = (userName: string): LocalUserContext => {
      const user = allTestUsers[userName]
      return { user }
    }

    // Create a new team
    const sourceTeam = teams.create('Spies Я Us', getUserContext('alice'))

    //  Always add Bob as an admin
    sourceTeam.add(bob, [ADMIN])

    for (const userName of userNames)
      if (!sourceTeam.has(userName)) sourceTeam.add(allTestUsers[userName])

    const pairKey = (a: string, b: string) => [a, b].sort().join(':')

    // Create one channel per pair of users
    const channels = {} as Record<string, TestChannel>
    for (const a of userNames) {
      for (const b of userNames) {
        if (a !== b) {
          const pair = pairKey(a, b)
          if (!(pair in channels)) {
            log(`creating test channel ${a} ${b}`)
            channels[pair] = new TestChannel()
          }
        }
      }
    }

    const makeUserStuff = (userName: string) => {
      const user = allTestUsers[userName]
      const context = getUserContext(userName)
      const device = redactDevice(user.device)
      const team = teams.load(JSON.stringify(sourceTeam.chain), context)
      const connectionContext = { team, user, device }
      const userStuff = {
        userName,
        user,
        context,
        device,
        team,
        connectionContext,
        connection: {} as Record<string, Connection>,
        getState: (u: string) => userStuff.connection[u].state,
      }
      return userStuff
    }

    const addConnectionToEachOtherUser = (A: UserStuff) => {
      const a = A.userName
      for (const b of userNames) {
        if (a !== b) {
          const pair = pairKey(a, b)
          const channel = channels[pair]!
          A.connection[b] = joinTestChannel(channel)(A.connectionContext)
        }
      }
      return A
    }

    const testUsers: Record<string, UserStuff> = userNames
      .map(makeUserStuff)
      .map(addConnectionToEachOtherUser)
      .reduce(arrayToMap('userName'), {})

    return testUsers
  }

  it('should send updates after connection is established', async () => {
    const { alice, bob } = setup(['alice', 'bob'])

    // 👩🏾<->👨🏻‍🦲 Alice and Bob connect
    await connect(alice, bob)

    // 👩🏾 Alice creates a new role
    expect(alice.team.hasRole('MANAGERS')).toBe(false)
    expect(bob.team.hasRole('MANAGERS')).toBe(false)
    alice.team.addRole('MANAGERS')

    // ✅ Bob sees the new role 👨🏻‍🦲💭
    await updated(alice, bob)
    expect(bob.team.hasRole('MANAGERS')).toBe(true)

    // 👩🏾 Alice adds Bob to the new role
    expect(alice.team.memberHasRole('bob', 'MANAGERS')).toBe(false)
    expect(bob.team.memberHasRole('bob', 'MANAGERS')).toBe(false)
    alice.team.addMemberRole('bob', 'MANAGERS')

    // ✅ 👨🏻‍🦲 Bob sees the change 👨🏻‍🦲💭
    await updated(alice, bob)
    expect(bob.team.memberHasRole('bob', 'MANAGERS')).toBe(true)
  })

  it('should resolve concurrent non-conflicting changes when updating', async () => {
    const { alice, bob } = setup(['alice', 'bob'])

    // 👩🏾 Alice creates a new role
    expect(alice.team.hasRole('MANAGERS')).toBe(false)
    alice.team.addRole('MANAGERS')
    expect(alice.team.hasRole('MANAGERS')).toBe(true)

    // 👨🏻‍🦲 concurrently, Bob invites Charlie
    const { id } = bob.team.invite('charlie')
    expect(bob.team.hasInvitation(id)).toBe(true)

    // Bob doesn't see the new role
    expect(bob.team.hasRole('MANAGERS')).toBe(false)

    // Alice doesn't see Bob's invitation for Charlie
    expect(alice.team.hasInvitation(id)).toBe(false)

    // 👩🏾<->👨🏻‍🦲 Alice and Bob connect
    await connect(alice, bob)

    // ✅ now Bob does see the new role 👨🏻‍🦲💭
    expect(bob.team.hasRole('MANAGERS')).toBe(true)

    // ✅ and Alice does see the invitation 👩🏾💭
    expect(alice.team.hasInvitation(id)).toBe(true)
  })

  it('should resolve concurrent duplicate changes when updating', async () => {
    const { alice, bob } = setup(['alice', 'bob'])

    // 👩🏾 Alice creates a new role
    alice.team.addRole('MANAGERS')
    expect(alice.team.hasRole('MANAGERS')).toBe(true)

    // 👨🏻‍🦲 concurrently, Bob adds the same role
    bob.team.addRole('MANAGERS')
    expect(bob.team.hasRole('MANAGERS')).toBe(true)

    // 👩🏾<->👨🏻‍🦲 Alice and Bob connect
    await connect(alice, bob)

    // ✅ nothing blew up, and they both have the role
    expect(alice.team.hasRole('MANAGERS')).toBe(true)
    expect(bob.team.hasRole('MANAGERS')).toBe(true)
  })

  it('resolves concurrent duplicate removals ', async () => {
    const { alice, bob } = setup(['alice', 'bob', 'charlie'])

    // 👳🏽‍♂️ Charlie is a member
    expect(alice.team.has('charlie')).toBe(true)
    expect(bob.team.has('charlie')).toBe(true)

    // 👨🏻‍🦲 Bob removes 👳🏽‍♂️ Charlie
    bob.team.remove('charlie')

    // 👩🏾 concurrently, Alice also removes 👳🏽‍♂️ Charlie
    alice.team.remove('charlie')

    // 👩🏾<->👨🏻‍🦲 Alice and Bob connect
    await connect(alice, bob)

    // ✅ nothing blew up, and Charlie has been removed on both sides 👳🏽‍♂️👎
    expect(alice.team.has('charlie')).toBe(false)
    expect(bob.team.has('charlie')).toBe(false)
  })

  it('a member can remove the founder', async () => {
    const { alice, bob } = setup(['alice', 'bob'])

    // 👩🏾<->👨🏻‍🦲 Alice and Bob connect
    await connect(alice, bob)

    // 👨🏻‍🦲 Bob removes Alice
    bob.team.remove('alice')

    // 👩🏾🔌👨🏻‍🦲 Alice is no longer a member, so they're disconnected
    await disconnection(alice, bob)

    // ✅ Alice is no longer on the team 👩🏾👎
    expect(bob.team.has('alice')).toBe(false)
    expect(alice.team.has('alice')).toBe(false)
  })

  it('resolves concurrent duplicate invitations when updating', () => {
    // TODO: Anything involving invitations will require tweaking the setup so that you get Charlie
    // and Dwight as users without adding them to the group
    //
    // Alice invites Charlie and Dwight
    // concurrently, Bob invites Charlie and Dwight
    // Alice and Bob connect
    // Charlie connects to Alice and is able to join
    // Dwight connects to Bob and is able to join
  })

  // it(`should handle concurrent admittance of the same invitation`, () => {
  //   // Alice invites Charlie
  //   // Charlie connects with Alice with his invitation proof
  //   // Concurrently, Charlie connects with Bob with his invitation proof
  //   // Alice connects with Bob
  //   // ?? it all works out?
  // })

  it('resolves mutual demotions in favor of the senior member', async () => {
    const { alice, bob } = setup(['alice', 'bob'])

    // 👨🏻‍🦲 Bob removes 👩🏾 Alice from admin role
    bob.team.removeMemberRole('alice', ADMIN)

    // 👩🏾 Alice concurrently removes 👨🏻‍🦲 Bob from admin role
    alice.team.removeMemberRole('bob', ADMIN)

    // 👩🏾<->👨🏻‍🦲 Alice and Bob connect. Bob's demotion of Alice is discarded (because they were
    // done concurrently and Alice is senior so she wins)
    await connect(alice, bob)

    // ✅ Alice is still an admin 👩🏾👍
    expect(alice.team.memberHasRole('alice', ADMIN)).toBe(true)
    expect(bob.team.memberHasRole('alice', ADMIN)).toBe(true)

    // ✅ Bob is no longer an admin 👨🏻‍🦲👎
    expect(alice.team.memberHasRole('bob', ADMIN)).toBe(false)
    expect(bob.team.memberHasRole('bob', ADMIN)).toBe(false)

    // ✅ They are still connected 👩🏾<->👨🏻‍🦲
    expect(alice.getState('bob')).toEqual('connected')
    expect(bob.getState('alice')).toEqual('connected')
  })

  it('resolves mutual removals in favor of the senior member', async () => {
    const { alice, bob, charlie, dwight } = setup(['alice', 'bob', 'charlie', 'dwight'])

    // 👨🏻‍🦲 Bob removes 👩🏾 Alice
    bob.team.remove('alice')

    // 👩🏾 Alice concurrently removes 👨🏻‍🦲 Bob
    alice.team.remove('bob')

    // 👳🏽‍♂️<->👨🏻‍🦲 Charlie and Bob connect
    await connect(bob, charlie)
    // 👳🏽‍♂️💭 Charlie now knows that Bob has removed Alice
    expect(charlie.team.has('alice')).toBe(false)

    // 👴<->👩🏾 Dwight and Alice connect
    await connect(alice, dwight)

    // 👴💭 Dwight now knows that Alice has removed Bob
    expect(dwight.team.has('bob')).toBe(false)

    // 👴<->👳🏽‍♂️ Dwight and Charlie connect
    await connect(dwight, charlie)

    // 👴💭 👳🏽‍♂️💭 Both Dwight and Charlie now know about the mutual conflicting removals. They each
    // discard Bob's removal of Alice (because they were done concurrently and Alice is senior so
    // she wins)

    // ✅ Both kept Alice 👩🏾👍
    expect(dwight.team.has('alice')).toBe(true)
    expect(charlie.team.has('alice')).toBe(true)

    // ✅ Both removed Bob 👨🏻‍🦲👎
    expect(dwight.team.has('bob')).toBe(false)
    expect(charlie.team.has('bob')).toBe(false)

    // ✅ Charlie is disconnected from Bob because Bob is no longer a member 👳🏽‍♂️🔌👨🏻‍🦲
    await disconnection(bob, charlie)
  })

  it(`when a member is demoted and makes concurrent changes, discards those changes`, async () => {
    const { alice, bob } = setup(['alice', 'bob', 'charlie'])

    // 👩🏾 Alice removes 👨🏻‍🦲 Bob from admin role
    alice.team.removeMemberRole('bob', ADMIN)

    // 👨🏻‍🦲 concurrently, Bob makes 👳🏽‍♂️ Charlie an admin
    bob.team.addMemberRole('charlie', ADMIN)
    expect(bob.team.memberHasRole('charlie', ADMIN)).toBe(true)

    // 👩🏾<->👨🏻‍🦲 Alice and Bob connect.
    await connect(alice, bob)

    // ✅ Bob's promotion of Charlie is discarded, because Bob concurrently lost admin privileges. 👨🏻‍🦲👳🏽‍♂️👎
    expect(alice.team.memberHasRole('charlie', ADMIN)).toBe(false)
    expect(bob.team.memberHasRole('charlie', ADMIN)).toBe(false)
  })

  // it(`when a member is demoted and concurrently adds a device, the new device is kept`, () => {
  //   // Alice removes Bob from admins
  //   // concurrently, Bob invites his phone
  //   // Bob's phone and laptop connect and the phone joins
  //   // Alice and Bob connect
  //   // Bob's phone is still in his devices
  // })

  // it(`when a member is demoted and concurrently invites a member and the member joins, the new member is removed`, () => {
  //   // Alice removes Bob from admins
  //   // concurrently, Bob invites Charlie
  //   // Bob and Charlie connect
  //   // Alice and Bob connect
  //   // Charlie's invitation is gone
  // })

  it('sends updates across multiple hops', async () => {
    const { alice, bob, charlie } = setup(['alice', 'bob', 'charlie'])

    // 👩🏾<->👨🏻‍🦲 Alice and Bob connect
    await connect(alice, bob)
    // 👨🏻‍🦲<->👳🏽‍♂️ Bob and Charlie connect
    await connect(bob, charlie)

    // 👩🏾 Alice creates a new role
    alice.team.addRole('MANAGERS')

    await Promise.all([updated(alice, bob), updated(bob, charlie)])

    // ✅ Charlie sees the new role, even though he's not connected directly to Alice 👳🏽‍♂️💭
    expect(charlie.team.hasRole('MANAGERS')).toEqual(true)
  })

  it('handles three-way connections', async () => {
    const { alice, bob, charlie } = setup(['alice', 'bob', 'charlie'])
    alice.team.addMemberRole('charlie', ADMIN)

    // (note that Bob and Charlie are both admins)
    expect(alice.team.memberHasRole('bob', ADMIN)).toBe(true)
    expect(alice.team.memberHasRole('charlie', ADMIN)).toBe(true)

    // 👩🏾<->👨🏻‍🦲 Alice and Bob connect
    await connect(alice, bob)
    // 👨🏻‍🦲<->👳🏽‍♂️ Bob and Charlie connect
    await connect(bob, charlie)
    // 👩🏾<->👳🏽‍♂️ Alice and Charlie connect
    await connect(alice, charlie)

    // Alice and Charlie connect
    // Bob and Charlie connect
    // Alice adds a new role
    // Bob adds a new role
    // Charlie adds a new role
    // All three get the three new roles
  })

  // it('resolves concurrent non-conflicting changes in three-way connections', () => {
  //   // Bob and Charlie are admins
  //   // Alice and Bob connect
  //   // Alice and Charlie connect
  //   // Bob and Charlie connect
  //   // Alice adds a new role
  //   // Bob adds a new role
  //   // Charlie adds a new role
  //   // All three get the three new roles
  // })

  // it('resolves concurrent conflicting changes in three-way connections', () => {
  //   // Bob and Charlie are admins
  //   // Alice and Bob connect
  //   // Alice and Charlie connect
  //   // Bob and Charlie connect
  //   // Alice adds a new role
  //   // Bob adds a new role
  //   // Charlie adds a new role
  //   // All three get the three new roles
  // })

  // it(`Eve steals Charlie's only device; Alice heals the team`, () => {
  //   // Eve steals Charlie's laptop
  //   // Alice removes the laptop from the team
  //   // Eve uses Charlie's laptop to try to connect to Bob, but she can't
  //   // Alice sends Charlie a new invitation; he's able to use it to connect from his phone
  // })

  // it(`Eve steals one of Charlie's devices; Charlie heals the team`, () => {
  //   // Charlie invites his phone and it joins
  //   // Eve steals Charlie's phone
  //   // From his laptop, Charlie removes the phone from the team
  //   // Eve uses Charlie's phone to try to connect to Bob, but she can't
  // })
})

const testName = () => expect.getState().currentTestName

const connect = async (a: UserStuff, b: UserStuff) => {
  a.connection[b.userName].start()
  b.connection[a.userName].start()
  await connection(a, b)
}

const connection = async (a: UserStuff, b: UserStuff) => {
  const connections = [a.connection[b.userName], b.connection[a.userName]]

  connections.forEach(c =>
    c.on('disconnected', () => {
      throw new Error(c.context.error?.message || 'Diconnected')
    })
  )

  // ✅ They're both connected
  await all(connections, 'connected')

  connections.forEach(c => c.removeAllListeners())

  const sharedKey = connections[0].context.sessionKey
  connections.forEach(connection => {
    expect(connection.state).toEqual('connected')
    // ✅ They've converged on a shared secret key
    expect(connection.context.sessionKey).toEqual(sharedKey)
  })
}

const updated = (a: UserStuff, b: UserStuff) => {
  const connections = [a.connection[b.userName], b.connection[a.userName]]
  return all(connections, 'updated')
}

const disconnection = async (a: UserStuff, b: UserStuff, message?: string) => {
  const connections = [a.connection[b.userName], b.connection[a.userName]]
  // ✅ They're both disconnected
  await all(connections, 'disconnected')
  connections.forEach(connection => {
    expect(connection.state).toEqual('disconnected')
    // ✅ If we're checking for a message, it matches
    if (message !== undefined) expect(connection.context.error!.message).toContain(message)
  })
}

/** Promisified event */
const all = (connections: Connection[], event: string) =>
  Promise.all(connections.map(c => new Promise(resolve => c.on(event, () => resolve()))))
