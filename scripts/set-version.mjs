import * as nbgv from 'nerdbank-gitversioning'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packagesDirectory = path.join(root, 'packages')

const updateLocalDeps = (folder, version) => {
  const packageJsonPath = `${folder}/package.json`
  const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8')
  const packageJson = JSON.parse(packageJsonContent)
  packageJson.version = version
  const dependencies = packageJson.dependencies
  Object.keys(dependencies).forEach(dep => {
    if (dep.startsWith('@microsoft/agents')) {
      packageJson.dependencies[dep] = version
    }
  })
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
}

const setPackageVersionAndBuildNumber = async versionInfo => {
  console.log('##vso[task.setvariable variable=CUSTOM_VERSION;]' + versionInfo.npmPackageVersion)
  await nbgv.setPackageVersion(root)
  const files = await fs.promises.readdir(packagesDirectory, { withFileTypes: true })
  const folders = files
    .filter(file => file.isDirectory())
    .map(folder => path.join(packagesDirectory, folder.name))

  for (const f of folders) {
    console.log(`Setting version number in ${f}`)
    updateLocalDeps(f, versionInfo.npmPackageVersion)
  }
}

const handleError = err => {
  console.error('Failed to update the package version number. nerdbank-gitversion failed: ' + err)
  process.exitCode = 1
}

const v = await nbgv.getVersion(root)
try {
  await setPackageVersionAndBuildNumber(v)
} catch (err) {
  handleError(err)
}
