# Feature Specification: Multi-Network Cards

**Feature Branch**: `feature/multi-network-cards`

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "Some banks issue one card with more than one payment network (e.g. Visa and JCB). The card catalog should support a card belonging to several networks, so the upcoming bank card import can model them correctly. Rewards mostly overlap across networks, except network-specific promotions."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recommend every usable network of a card (Priority: P1)

A shopper asks which payment method to use at a merchant. A card that carries two networks is accepted by the merchant on both. The recommendation lists the card once per network, so a shopper who holds the card can pick the line whose network matches their physical card.

**Why this priority**: The system does not store the shopper's cards, so it cannot know which network the shopper's card uses. Listing every network avoids recommending a line that does not match.

**Independent Test**: Create a card with two networks, a merchant accepting both, and a general reward rule on the card; request a recommendation and verify two lines, one per network, with identical general reward.

**Acceptance Scenarios**:

1. **Given** a card on networks A and B and a merchant accepting both, **When** a recommendation is requested, **Then** the card appears twice, labeled with each network name.
2. **Given** the merchant accepts only network A, **When** a recommendation is requested, **Then** the card appears once, for network A.
3. **Given** a merchant issuer allowlist on network A that excludes the card's issuer, **When** a recommendation is requested, **Then** the card is omitted for network A but still listed for network B if allowed there.
4. **Given** a merchant card exclusion for the card, **When** a recommendation is requested, **Then** the card is omitted for all networks.

---

### User Story 2 - Network-specific promotions apply only to their network (Priority: P1)

A promotion targets one payment network (for example a Visa-only offer). Cards that carry several networks receive that promotion only on the targeted network line. Promotions that do not target a network apply to every network line of the card.

**Why this priority**: This is the one place where networks of the same card differ in reward, and it must stay correct.

**Independent Test**: With a card on networks A and B, a promotion targeting A only and a general promotion, verify the A line gets both and the B line gets only the general one.

**Acceptance Scenarios**:

1. **Given** a promotion targeting network A, **When** a recommendation is requested, **Then** only the network A line of the card receives it.
2. **Given** a card-scoped promotion for the card and a network-agnostic scope, **When** a recommendation is requested, **Then** every network line of the card receives it.

---

### User Story 3 - Admin manages multiple networks per card (Priority: P2)

An administrator creates or edits a card and selects one or more credit-card networks. Existing single-network cards keep working unchanged after upgrade.

**Why this priority**: Needed to enter data by hand and for the importer to target; existing data safety is mandatory.

**Independent Test**: Create a card with two networks via the admin UI/API, reload, and verify both persist; upgrade a database containing single-network cards and verify each keeps its network.

**Acceptance Scenarios**:

1. **Given** the card form, **When** the admin selects two networks and saves, **Then** the card lists both networks.
2. **Given** a card with no network selected, **When** the admin saves, **Then** the system rejects it with an explicit error.
3. **Given** a network that is not a credit-card payment method, **When** the admin saves, **Then** the system rejects it with an explicit error.
4. **Given** existing cards with one network each, **When** the schema is upgraded, **Then** each card keeps exactly its prior network.

### Edge Cases

- Duplicate networks submitted for one card.
- A card whose networks are all unaccepted by the merchant.
- A reward rule bound to a payment method that is one of the card's networks.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A card MUST be able to belong to one or more credit-card networks, and MUST have at least one.
- **FR-002**: The system MUST reject cards with no networks, duplicate networks, or networks that are not credit-card payment methods, with explicit errors.
- **FR-003**: Recommendations MUST produce one line per (card, accepted network) pair, using the existing display format that includes the network name.
- **FR-004**: Merchant issuer allowlists MUST be evaluated per network, and merchant card exclusions MUST apply to all networks of the card.
- **FR-005**: Promotions and reward rules that target a payment method MUST apply only to the card's line for that network; others MUST apply to every network line.
- **FR-006**: The admin API and UI MUST read and write a card's list of networks using catalog identifiers.
- **FR-007**: Upgrading an existing database MUST preserve every card's current network without data loss.

### Key Entities

- **Card**: A card product from one issuer, with a kind and a set of one or more networks.
- **Card network membership**: The link between a card and a credit-card payment method.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A card with N accepted networks yields exactly N recommendation lines.
- **SC-002**: Network-specific promotions appear on exactly their targeted network line and no other.
- **SC-003**: After upgrade, 100% of pre-existing cards retain their original network and recommendations for them are unchanged.
- **SC-004**: The importer phase can represent a multi-network card without schema changes.

## Assumptions

- Shopper cards are not stored, so all networks are listed instead of a single best one (decided with the product owner).
- General rewards are identical across a card's networks; only promotions differ.
- Debit and prepaid cards keep the same network rules as today.
- Bank card import and promotion crawling are out of scope here.
