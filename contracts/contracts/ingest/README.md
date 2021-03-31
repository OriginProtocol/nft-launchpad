# Ingest

These contracts move user funds from endpoint accounts to a central pool account.



         ┌───────────┬─────────Funds─────────┐
      ▼  │       ▼   │                       ▼
    ┌────┴───┐ ┌─────┴──┐     ┌──────┐     ┌────┐
    │Endpoint│ │Endpoint│ ◄── │Master│     │Pool│
    └──────┬─┘ └─┬──────┘     └┬─────┘     └────┘
           │     │             │    ▲
           ▼     ▼             ▼    │
          ┌────────┐    ┌────────┐  └─────┬─────┐
          │MidProxy│ ──►│Registry│        │┼────┴───────┐
          └────┬───┘    └────────┘        │┼───────────┼│
               │                          ││Application││
               ▼                          │┼───────────┼│
            ┌────┐                        └─────────────┘
            │Impl│
            └────┘
