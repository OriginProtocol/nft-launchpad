# Story Staking Contracts

These contracts collectively allow for Origin Story profit sharing through OGN
staking.

## Contracts Overview

- `Series` - The primary interface for users to stake, unstake. It's also the
  source of truth for the season sequencing and relevant addresses
- `SeasonOne` - The logic for season one staking and rewards calculation
- `SeasonTwo` - The unfinished template logic for season two staking and rewards
  calculation. This is currently identical to SeasonOne
- `stOGN` - An ERC-20-like OGN vault used to track OGN stakes across seasons
- `FeeVault` - The royalty recipient and storage vault of ETH profit shares to
  be distributed to stakers.

### Season Lifecycle

The general season lifecycle looks like this:

    |---------------|---------------|--------------|
     SeasonOne      | Lock period   | Claim Period |
                    |               |--------------------|---------------|---------------|
                    | Pre-stake     | SeasonTwo          | Lock period   | Claim period  |

Not to scale, but should show how we expect these periods to overlap. This is
what we expect season one to look like:

| Stage        | Begin                | End               |
| ------------ | -------------------- | ----------------- |
| Pre-stake    | Upon deployment      | Start             |
| Season       | At the startTime     | Lock              |
| Lock period  | 30 days before End   | End               |
| End          | 120 days after Start | Claim             |
| Claim period | End                  | 45 days after End |

There may be some adjustments on following seasons depending on our learnings.

## Usage

Usage examples are pythonic and just used as a quick logic example of contract
interaction.

### Stake

Staking 1000 OGN.

    ogn_amount = 1000e18 # 1000 OGN
    ogn.approve(series.address, ogn_ammount)
    series.stake(ogn_ammount)

Staking may occur multiple times. Each following stake's power may be reduced
due to points calculation.

### Unstake

User unstaking. This is always their entire stake.

    series.unstake()

If this is done before the season is over, all rewards are forfeited.

### Calculate User's Power

Calculate a user's current percentage of pool ownership.

    season_address = series.currentSeason()
    season = Contract(season_address, season_abi)
    # Float percentage of their current pool ownership (may change as stakes
    # are added and removed)
    power = season.getTotalPoints() / season.getPoints(user_address)
