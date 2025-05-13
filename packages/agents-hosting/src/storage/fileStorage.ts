import { Storage, StoreItem } from './storage'
import fs from 'fs'

export class FileStorage implements Storage {
  private _folder: string
  private _stateFile: Record<string, string>
  constructor (folder: string) {
    this._folder = folder
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true })
    }
    if (!fs.existsSync(folder + '/state.json')) {
      fs.writeFileSync(folder + '/state.json', '{}')
    }
    const data = fs.readFileSync(folder + '/state.json', 'utf8')
    this._stateFile = JSON.parse(data)
  }

  read (keys: string[]) : Promise<StoreItem> {
    return new Promise((resolve, reject) => {
      if (!keys || keys.length === 0) {
        reject(new ReferenceError('Keys are required when reading.'))
      } else {
        const data: StoreItem = {}
        for (const key of keys) {
          const item = this._stateFile[key]
          if (item) {
            data[key] = item
          }
        }
        resolve(data)
      }
    })
  }

  write (changes: StoreItem) : Promise<void> {
    const keys = Object.keys(changes)
    for (const key of keys) {
      this._stateFile[key] = changes[key]
    }
    fs.writeFileSync(this._folder + '/state.json', JSON.stringify(this._stateFile, null, 2))
    return Promise.resolve()
  }

  delete (keys: string[]) : Promise<void> {
    return new Promise((resolve, reject) => {
      if (!keys || keys.length === 0) {
        reject(new ReferenceError('Keys are required when reading.'))
      } else {
        for (const key of keys) {
          delete this._stateFile[key]
        }
        fs.writeFileSync(this._folder + '/state.json', JSON.stringify(this._stateFile, null, 2))
      }
      resolve()
    })
  }
}
