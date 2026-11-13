import { defineBuildConfig } from 'unbuild'
import { mergeDefaultBuildConfig } from '../../scripts/build.common'

export default defineBuildConfig(mergeDefaultBuildConfig({
  entries: [
    { input: 'src/index', name: 'index' },
    { input: 'src/bin', name: 'bin' },
  ],
}))
