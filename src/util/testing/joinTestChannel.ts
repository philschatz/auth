import { TestChannel } from '/util/testing/TestChannel'
import { ConnectionContext, Connection, SendFunction } from '/connection'
import { pause } from '/util/pause'

export const joinTestChannel = (channel: TestChannel) => (context: ConnectionContext) => {
  const id = context.device.deviceId

  // hook up send
  const sendMessage: SendFunction = msg => channel.write(id, msg)

  // Instantiate the connection service
  const connection = new Connection({ sendMessage, context })

  // hook up receive
  channel.addListener('data', async (senderId, msg) => {
    if (senderId === id) return // I can ignore messages that I sent

    // simulate a random delay, then deliver the message
    const delay = 1 //Math.floor(Math.random() * 100)
    await pause(delay)
    connection.deliver(msg)
  })

  channel.addPeer()

  return connection
}
