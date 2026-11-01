# Feature Specification: Bank Card Catalog and Reward Import

**Feature Branch**: `feature/bank-card-import`

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "Credit cards and their rewards must come from major banks, not hand entry. Import each bank's card catalog (issuer, card, payment networks) and its card-specific rewards/promotions into the existing Admin review flow before publication. First banks: Taishin, First Bank, Far Eastern International Bank, plus proposed additional banks. Scheduling is out of scope for this round."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import a bank's card catalog for review (Priority: P1)

An administrator runs an import for one bank. The system reads that bank's official credit-card pages and creates pending card drafts, each with the issuer, card name, card kind, and the payment networks the card carries. The administrator reviews the drafts in the Admin page, corrects any field, then publishes or rejects each one. Published drafts become catalog cards that the recommender can use.

**Why this priority**: Without catalog cards, no card-specific recommendation or reward can exist. This is the foundation for everything else in this feature.

**Independent Test**: Run the import for one bank against saved official-page samples; verify pending drafts appear with issuer, name, kind, and networks; publish one and verify it appears in the card catalog with all its networks.

**Acceptance Scenarios**:

1. **Given** a bank whose official page lists three cards, **When** the import runs, **Then** three pending card drafts exist for that bank, each linked to the import run.
2. **Given** a card draft listing two networks, **When** the administrator publishes it, **Then** the catalog card carries both networks.
3. **Given** a draft whose network name is not in the payment-method catalog, **When** the administrator reviews it, **Then** the draft cannot be published until the network is matched to an existing credit-card payment method or the draft is corrected.
4. **Given** a card that already exists in the catalog, **When** the import runs again, **Then** no duplicate draft or catalog card is created, and any changed details are shown for review instead of silently overwriting.
5. **Given** an administrator rejects a draft, **When** the same card is imported again unchanged, **Then** it is not resurfaced as a new pending draft.

---

### User Story 2 - Import card-specific rewards and promotions for review (Priority: P1)

For the same bank, the import also collects card promotions: merchant offers that apply to particular cards or to all cards of the issuer. Each becomes a pending promotion draft already scoped to the relevant cards or issuer. The administrator confirms the merchant, benefit, threshold, validity, and card scope, then publishes. Published promotions then appear in recommendations for the matching cards.

**Why this priority**: Recommending a specific card is only useful with its rewards. Reuses the existing promotion review flow so reviewers learn nothing new.

**Independent Test**: Import a bank's promotion page sample; verify drafts show the bank's issuer or specific cards as scope; publish one and verify the recommendation for that merchant lists only the scoped cards with the reward.

**Acceptance Scenarios**:

1. **Given** a promotion offered to one named card, **When** it is imported, **Then** the draft's card scope is that card (matched from the catalog) and it cannot be published without a valid scope.
2. **Given** a promotion offered to all of a bank's cards, **When** it is imported, **Then** the draft's scope is the issuer.
3. **Given** a promotion naming a card that is not in the catalog, **When** it is imported, **Then** the draft is flagged as needing a card match and does not publish with an empty scope.
4. **Given** a promotion limited to one network of a multi-network card, **When** it is reviewed, **Then** the administrator can select that network as the promotion's payment method.
5. **Given** the same promotion is imported twice, **When** the second run finishes, **Then** there is still one draft or published promotion for it.

---

### User Story 3 - Trust and diagnose imports (Priority: P2)

An administrator can see, per import run, which bank was imported, how many card drafts and promotion drafts were created, and any failure. A failure in one bank or one page never loses data from other banks, never publishes anything automatically, and states which source failed and why.

**Why this priority**: Bank pages change often; explicit failures keep the catalog trustworthy.

**Independent Test**: Make one bank's source unreachable or malformed; verify the run records a failure with a clear message while other banks still import.

**Acceptance Scenarios**:

1. **Given** a bank page that cannot be fetched, **When** the import runs, **Then** the run is marked failed with the bank and reason, and no partial drafts are published.
2. **Given** a page whose layout is no longer recognized, **When** the import runs, **Then** the run fails explicitly instead of producing empty or guessed drafts.
3. **Given** a source URL outside the bank's official hosts, **When** it appears in a page, **Then** it is ignored and never fetched.

### Edge Cases

- A card is sold under slightly different names across pages (spacing, full-width characters, suffixes such as "御璽卡").
- One page lists the same card with several networks or with a network that is only available as a co-brand.
- A bank page lists debit or prepaid cards; only credit cards are in scope unless the bank clearly labels another kind.
- A promotion applies to a card category (for example "all platinum cards") that matches several catalog cards.
- A card is discontinued and disappears from the bank page; existing catalog cards must not be deleted automatically.
- A bank site blocks automated access or requires scripts to render; the import fails explicitly and is documented for that bank.
- Validity dates missing or in a non-standard calendar (for example Republic of China years).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST import credit-card catalog data from each configured bank's official pages and create pending card drafts containing issuer, card name, card kind, and one or more payment networks.
- **FR-002**: Card drafts MUST be reviewed in the Admin page; no imported card may enter the catalog without explicit administrator approval.
- **FR-003**: Publishing a card draft MUST create or match the issuer, create the card with all its networks, and reject drafts whose networks do not match existing credit-card payment methods.
- **FR-004**: Re-running an import MUST be idempotent: existing catalog cards and previously seen drafts are not duplicated, rejected drafts are not resurfaced unchanged, and detected differences are presented for review rather than applied silently.
- **FR-005**: The system MUST import card-specific merchant promotions from the same banks as pending promotion drafts using the existing draft review and publish flow.
- **FR-006**: Imported promotion drafts MUST carry a card or issuer scope when the source names one, and MUST NOT be publishable with an unresolved card reference.
- **FR-007**: Promotion drafts MUST allow the reviewer to choose a specific payment network for multi-network cards.
- **FR-008**: Each import MUST record a run per bank with the bank, status, counts of card drafts and promotion drafts, and a failure message when applicable.
- **FR-009**: Import failures (unreachable source, unrecognized layout, invalid data) MUST be surfaced explicitly and MUST NOT publish, delete, or overwrite catalog data.
- **FR-010**: The import MUST fetch only official bank hosts and paths allowed for that bank, and MUST ignore other links.
- **FR-011**: The first release MUST cover Taishin Bank, First Bank, and Far Eastern International Bank, plus additional banks proposed in the plan and approved by the product owner.
- **FR-012**: Importing a bank MUST be triggered on demand by an administrator or operator; scheduled or recurring runs are out of scope.
- **FR-013**: The import MUST NOT delete or deactivate catalog cards that disappear from a bank page.
- **FR-014**: Imported data MUST preserve the source URL and capture time so reviewers can check the original page.

### Key Entities

- **Bank source**: A configured bank with its official hosts, entry pages, and issuer identity.
- **Card draft**: A pending card record from a bank page: issuer, card name, kind, networks, source URL, status, and review outcome.
- **Promotion draft (card-scoped)**: The existing promotion draft, with card or issuer scope and optional network selection.
- **Import run**: One execution for one bank, with counts and outcome.
- **Catalog card / issuer**: The published records the recommender reads.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For each covered bank, an administrator can go from running the import to a published, recommendable card in under 5 minutes of review for a typical card.
- **SC-002**: Repeating an import without source changes creates zero new drafts and zero duplicate catalog cards.
- **SC-003**: 100% of published imported cards and promotions were explicitly approved by an administrator.
- **SC-004**: 100% of import failures state the bank and cause, and leave previously published data unchanged.
- **SC-005**: At least 90% of cards listed on each covered bank's official credit-card page appear as drafts after one import, as measured against saved sample pages.
- **SC-006**: A published card-scoped promotion appears only for the targeted cards (and network, if selected) in recommendations.

## Assumptions

- Only publicly accessible official bank pages are used; access is limited to the bank's own hosts. Banks whose pages cannot be read without bypassing access controls are excluded and documented.
- Reviewed, published data is the only data the recommender reads (same trust model as current promotion imports).
- Initial bank list: Taishin, First Bank, Far Eastern International Bank (required), plus Cathay United, CTBC, and E.SUN proposed for approval during planning.
- Baseline card rewards that are not tied to a merchant (for example a flat overseas rate) are out of scope; only merchant-specific offers are imported, because recommendations are merchant-based.
- Wallet bank/card-binding promotions (JKO Pay, iPASS MONEY) and scheduled crawling remain later work.
- Card kind defaults to credit unless the page states otherwise.
- Card network labels on bank pages (for example Visa, Mastercard, JCB, UnionPay) map to existing credit-card payment methods; unknown labels block publication instead of creating payment methods automatically.
