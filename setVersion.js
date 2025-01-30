import * as nbgv from 'nerdbank-gitversioning'
import fs from 'fs'

const upddateLocalDeps = (folder, version) => {
  const packageJsonPath = `${folder}/package.json`
  console.log(packageJsonPath)
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const dependencies = packageJson.dependencies
  Object.keys(dependencies).forEach(dep => {
    if (dep.startsWith('@microsoft/agents')) {
      packageJson.dependencies[dep] = version
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
      console.log(`Updated ${dep} to ${version} in ${packageJsonPath}`)
    }
  })
}

const setPackageVersionAndBuildNumber = versionInfo => {
  console.log('##vso[task.setvariable variable=CUSTOM_VERSION;]' + versionInfo.npmPackageVersion)

  fs.readdir('packages', { withFileTypes: true }, (err, files) => {
    if (err) {
      console.error('Failed to read the packages directory: ' + err)
      return
    }
    const folders = files
      .filter(file => file.isDirectory())
      .map(folder => `${folder.parentPath}/${folder.name}`)
    folders.forEach(f => {
      nbgv.setPackageVersion(f)
      upddateLocalDeps(f, versionInfo.npmPackageVersion)
    })
  })
}

const handleError = err => console.error('Failed to update the package version number. nerdbank-gitversion failed: ' + err)

nbgv.getVersion()
  .then(setPackageVersionAndBuildNumber)
  .catch(handleError)
