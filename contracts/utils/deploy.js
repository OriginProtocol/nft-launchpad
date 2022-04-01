//
// Deployment utilities
//

const hre = require('hardhat')

const isRinkeby = hre.network.name === 'rinkeby'
const isMainnet = hre.network.name === 'mainnet'

// Wait for 3 blocks confirmation on Mainnet/Rinkeby.
const NUM_CONFIRMATIONS = isMainnet || isRinkeby ? 3 : 0

/**
 * Logging method for deployments.
 * @param msg
 * @param deployResult
 */
function log(msg, deployResult = null) {
  if (process.env.VERBOSE) {
    if (deployResult && deployResult.receipt) {
      const gasUsed = Number(deployResult.receipt.gasUsed.toString())
      msg += ` Address: ${deployResult.address} Gas Used: ${gasUsed}`
    }
    console.log('INFO:', msg)
  }
}

/**
 * Calculates an above average gas price.
 * Can be used to submit a transaction for faster than average mining time.
 *
 * @param {Number} mutliplier: Multiplier applied to the current gas price in base points. For ex 115 gives an extra 15%.
 * @returns {Promise<BigNumber>}
 */
async function premiumGasPrice(multiplier) {
  const gasPriceMultiplier = ethers.BigNumber.from(Number(multiplier))
  const gasPriceDivider = ethers.BigNumber.from(100)

  if (gasPriceMultiplier.lt(100) || gasPriceMultiplier.gt(200)) {
    throw new Error(`premiumGasPrice called with multiplier out of range`)
  }
  // Get current gas price from the network.
  const gasPrice = await hre.ethers.provider.getGasPrice()

  const premiumGasPrice = gasPrice.mul(gasPriceMultiplier).div(gasPriceDivider)

  if (process.env.VERBOSE) {
    console.log(
      `Gas price (gwei): Regular=${ethers.utils.formatUnits(
        gasPrice,
        'gwei'
      )} Premium=${ethers.utils.formatUnits(premiumGasPrice, 'gwei')}`
    )
  }

  return premiumGasPrice
}

/**
 * Returns extra options to use when sending a tx to the network.
 * @param {Number} gasLimit: Optional gas limit to set.
 * @returns {Promise<void>}
 */
async function getTxOpts(gasLimit = null) {
  const txOpts = {}
  if (gasLimit) {
    txOpts.gasLimit = gasLimit
  }
  if (process.env.GAS_PRICE_MULTIPLIER) {
    const gasPrice = await premiumGasPrice(process.env.GAS_PRICE_MULTIPLIER)
    txOpts.gasPrice = gasPrice
  }
  return txOpts
}

/**
 * Execute a tx or a deploy and wait for X block confirmation.
 * @param deployOrTransactionPromise
 * @returns {Promise<{receipt}|*>}
 */
const withConfirmation = async (deployOrTransactionPromise) => {
  const result = await deployOrTransactionPromise
  await hre.ethers.provider.waitForTransaction(
    result.receipt ? result.receipt.transactionHash : result.hash,
    NUM_CONFIRMATIONS
  )
  return result
}

/**
 * Deploy a contract and wait for X blocks confirmation.
 * @param contractName
 * @param args
 * @param contract
 * @param gasLimit
 * @returns {Promise<{receipt}|*>}
 */
const deployWithConfirmation = async (contractName, args, contract, gasLimit) => {
  const { deploy } = deployments
  const { deployerAddr } = await getNamedAccounts()
  if (!args) args = null
  if (!contract) contract = contractName
  const result = await withConfirmation(
    deploy(contractName, {
      from: deployerAddr,
      args,
      contract,
      fieldsToCompare: null,
      ...(await getTxOpts(gasLimit))
    })
  )

  log(`Deployed ${contractName}`, result)
  return result
}

module.exports = {
  log,
  getTxOpts,
  deployWithConfirmation,
  withConfirmation
}
