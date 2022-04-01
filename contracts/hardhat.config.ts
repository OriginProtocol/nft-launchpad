const path = require('path')
import { promises as fs } from 'fs'
import { config } from 'dotenv'

config({ path: '../server/.env' })
const { mnemonic, privateKeys } = require('../server/src/utils/accounts')
import '@nomiclabs/hardhat-waffle'
import '@nomiclabs/hardhat-etherscan'

const {
  TASK_VERIFY_GET_COMPILER_VERSIONS,
  TASK_VERIFY_GET_MINIMUM_BUILD
} = require('@nomiclabs/hardhat-etherscan/dist/src/constants')

import 'hardhat-deploy'
import 'hardhat-deploy-ethers'
import { task } from 'hardhat/config'
import { BuildInfo } from 'hardhat/types'
import { CompilerOutput } from 'hardhat/src/types/artifacts'

const PROVIDER_URL = process.env.PROVIDER_URL || 'http://localhost:8545'
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY

task('accounts', 'Prints the list of accounts', async (_, hre) => {
  const accounts = await hre.ethers.getSigners()

  let i = 0
  for (const account of accounts) {
    console.log(account.address, privateKeys[i++] || '')
  }
})

task('bundle', 'Creates a contract JSON bundle')
  .addParam('contract', 'Contract to bundle')
  .addParam('outfile', 'Path to bundle JSON file to create')
  .setAction(async (taskArgs, { artifacts, run }) => {
    /**
     * This task is loosely based on hardhat-etherscan verify tasks.  It uses
     * a bunch of its subtasks to gather the information we need for the
     * deploy & verification bundles.  These bundles are then used by the
     * server for repeatable and verifiable deployments of the NFT contract.
     *
     * Ref: https://github.com/nomiclabs/hardhat/blob/677099d520a3756929145ff450dfd7d39babf036/packages/hardhat-etherscan/src/index.ts
     */

    // Make sure that contract artifacts are up-to-date.
    await run('compile')

    // Get the metadata we need
    const contractName = taskArgs.contract
    const sourceName = `contracts/nft/${contractName}.sol`

    // Fetch build that includes our bytecode
    const minimumBuild: BuildInfo = await run(TASK_VERIFY_GET_MINIMUM_BUILD, {
      sourceName
    })

    // Get the ABI according to Hardhat's artifacts
    const contractFQN = `${sourceName}:${contractName}`
    const buildInfo: BuildInfo | undefined = await artifacts.getBuildInfo(
      contractFQN
    )

    // Assemble the bundle we can use for repeatable deployments and etherscan verification
    const compilerVersions = await run(TASK_VERIFY_GET_COMPILER_VERSIONS)
    const abi = buildInfo?.output?.contracts[sourceName][contractName].abi
    const contract = minimumBuild.output.contracts[sourceName][contractName]
    const bytecode = contract.evm.bytecode.object
    const deployedBytecode = contract.evm.deployedBytecode.object
    const input = minimumBuild.input
    const contractInformation = {
      compilerVersions,
      abi,
      sourceName,
      contractName,
      bytecode,
      deployedBytecode,
      input
    }

    // Write to tasArgs.outfile
    const outPath = path.normalize(taskArgs.outfile)
    await fs.writeFile(outPath, JSON.stringify(contractInformation))

    console.log(`Wrote bundle to ${outPath}`)
  })

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: '0.8.4',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      accounts: {
        mnemonic,
        count: 200
      },
      hardfork: 'london',
      initialBaseFeePerGas: '1000000000',
      chainId: 31337
    },
    rinkeby: {
      url: PROVIDER_URL,
      accounts: privateKeys.slice(0, 2)
    },
    kovan: {
      url: PROVIDER_URL,
      accounts: privateKeys.slice(0, 2)
    },
    mainnet: {
      url: PROVIDER_URL,
      accounts: privateKeys.slice(0, 2)
    },
    goerli: {
      url: PROVIDER_URL,
      accounts: privateKeys.slice(0, 2)
    },
    polygon_mainnet: {
      url: PROVIDER_URL, //'https://rpc-mainnet.matic.network',
      accounts: privateKeys.slice(0, 2)
    },
    polygon_testnet: {
      url: PROVIDER_URL, //'https://rpc-mumbai.maticvigil.com',
      accounts: privateKeys.slice(0, 2)
    }
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY
  },
  namedAccounts: {
    deployerAddr: {
      default: 0,
      localhost: 0
    },
    signerAddr: {
      default: 1,
      localhost: 1
    },
    masterAddr: {
      default: 2,
      localhost: 2
    },
    poolAddr: {
      default: 3,
      localhost: 3
    }
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts'
  }
}
