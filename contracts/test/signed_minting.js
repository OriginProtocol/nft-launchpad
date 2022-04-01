const { expect } = require('chai')
const { defaultFixture } = require('./_fixture')
const { loadFixture } = require('./helpers')
const { formatBytes32String } = require('ethers').utils

describe('OriginERC721_v3 token works', () => {
  it.skip('Can Mint', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { nftv3, master } = fixture
    const randomUserOne = ethers.provider.getSigner(4)
    const randomUserTwo = ethers.provider.getSigner(4)
    const block = await ethers.provider.getBlock()

    // Mint works
    const userOneAddress = await randomUserOne.getAddress()

    const hash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'uint256', 'uint256'],
        [userOneAddress, 23, block.timestamp - 5, block.timestamp + 5]
      )
    )
    const sig = await master.signMessage(ethers.utils.arrayify(hash))

    await nftv3.signedMint(
      userOneAddress,
      23,
      block.timestamp - 5,
      block.timestamp + 5,
      sig
    )

    expect(await nftv3.ownerOf(23)).to.be.equal(userOneAddress)

    // // Normal user can't
    // //
    // await expect(
    //   nftv2.connect(randomUserTwo).safeMint(userOneAddress, 24)
    // ).to.be.revertedWith('Ownable: caller is not the owner')

    // safeMint(address to, uint256 tokenId, uint256 startBlock, uint256 endBlock, bytes memory sig) external {
  })
})
