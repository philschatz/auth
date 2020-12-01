﻿import fs from 'fs'
import os from 'os'
import _debug from 'debug'

const isoDateRx = /((\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+)|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d)|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d))Z? /
const logFile = 'log.txt'

const process = (s: string) => {
  s = s
    .replace(isoDateRx, '')
    .replace(/taco:connection:alice/, '👩🏾')
    .replace(/taco:connection:bob/, '👨🏻‍🦲')
    .replace(/taco:connection:charlie/, '👳🏽‍♂️')
    .replace(/taco:connection:dwight/, '👴')
  s += os.EOL
  return s
}

const debug = (s: string) => {
  const logger = _debug(s)
  logger.log = (s: string) => fs.appendFileSync(logFile, process(s))

  return logger
}

debug.clear = () => fs.writeFileSync(logFile, '')

debug.clear()

export default debug