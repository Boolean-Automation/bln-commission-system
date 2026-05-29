---
last_snapshot: 2026-05-20T08:15:27Z
snapshot_by: python-cron
source: api
source_detail: airtable-meta-api (schema+formulas (366 bodies))
trust_level: trusted
invalidated_by: []
---

# Airtable: Commissions

**Client:** `paragon-painting-atlanta`
**Base:** `appoMG3V2gfaN2dEo`
**Table ID:** `tblkdwfASoizOo42D`
**Primary field:** `fldw3ToequuPojqu3`
**Views:** 30

## Fields (95)

- **Commission ID** (`formula`) — formula: `{fldwfELn1NIjMLJFy} & {fldt005QCaDsbWQc5} & "-" & {fldZqEgTrupdG6yOJ} & " /\n" & {fldoAmkotvNjxywE2} & ": " & {fldN4ez9gZDO1gckq}` → result `singleLineText`
- **Employee** (`multipleRecordLinks`) — links → `tblpbiWFo4ADVgB1I`
- **Status** (`singleSelect`) — choices: Pending, Approved, Denied
- **Job** (`multipleRecordLinks`) — links → `tblDG6YveJC0cDjGb`
- **Commission** (`formula`) — formula: `IF(   {fldUEuJ9Bt9jUohLn},    ROUND(IF(     NOT({fldE0CJbPiWGMItjK} = BLANK()),     {fldkbxynN4jgwCLOZ},     SWITCH(       {fldt005QCaDsbWQc5},       "SL", {fldJfWpxbqscxJDpe},       "SM", {fldTRkDNSN…` → result `currency`
- **Type** (`singleSelect`) — choices: Sales (SL), Sales Manager (SM), Project Manager (PM), Production Manager (PMM), Referral Bonus (REF), Miscellaneous (MSC), Adjustment (ADJ), Payout (PAY) (+1 more)
- **(Job) Job Status** (`multipleLookupValues`) — multi-lookup via `fldMsLL7pAVT5IxQU`
- **(Job) Total Job Amount** (`multipleLookupValues`) — multi-lookup via `fldMsLL7pAVT5IxQU`
- **(Job) Gross Profit %** (`multipleLookupValues`) — multi-lookup via `fldMsLL7pAVT5IxQU`
- **(Job) GP Qualified** (`formula`) — formula: `ROUND({fldpA0FkBTczed1K1} * 100, 4) >= 40` → result `checkbox`
- **Position at Date Costed** (`singleSelect`) — choices: SL1, SL2, SM1, PM1, PMM1
- **Commission Tier % [SL]** (`formula`) — formula: `SWITCH(   {fldFnAQyYNsF8UDXy},   "SL1",     IF(       {fldlFJDLeZyVfL8QW} < 1000000, 0.025,       IF(         {fldlFJDLeZyVfL8QW} < 1500000, 0.03,         IF(           {fldlFJDLeZyVfL8QW} < 2000000, …` → result `percent`
- **Job Costed Date** (`formula`) — formula: `IF({flddxafHm2jZcR08c}, {flddxafHm2jZcR08c}, IF(OR({fldtZflojtZcjdCZa} = "Closed", {fldtZflojtZcjdCZa} = "Job Costed"), {fldp7TvOOpvXDbZCy}, BLANK()))` → result `dateTime`
- **(Job) Is Job Cancelled?** (`multipleLookupValues`) — multi-lookup via `fldMsLL7pAVT5IxQU`
- **(Job) Initial Contract $** (`multipleLookupValues`) — multi-lookup via `fldMsLL7pAVT5IxQU`
- **YTD Sales at Costed [SL]** (`currency`)
- **Commission / Job Costed Date** (`dateTime`)
- **Override Commission** (`currency`)
- **Type Abbr.** (`formula`) — formula: `IF({fld31Z1OxC8KvWNW4}, REGEX_EXTRACT({fld31Z1OxC8KvWNW4}, "\\(([^)]+)\\)"), "")` → result `singleLineText`
- **(Job) Job Number** (`multipleLookupValues`) — multi-lookup via `fldMsLL7pAVT5IxQU`
- **(People) Last Name** (`multipleLookupValues`) — multi-lookup via `fldVQa8YVCOIxkSNL`
- **Identifier** (`formula`) — formula: `IF(   {fldwfELn1NIjMLJFy} = "⚠️ ",   BLANK(),   IF(     {fldMsLL7pAVT5IxQU},     {fldJHIh8KY60kMEUj} & " " & {fldjTyisHEld703JP},     IF(       {fldcwwUB8jjzwnxbs},       {fldks3ZdYHOPWveco} & " " & {…` → result `singleLineText`
- ****ID Check** (`singleLineText`)
- ****ID Match** (`formula`) — formula: `{fldZqEgTrupdG6yOJ} = {fldfpRaHtIIylAuvT}` → result `checkbox`
- **(Job) All Project Statuses** (`multipleLookupValues`) — multi-lookup via `fldMsLL7pAVT5IxQU`
- **Create Date** (`createdTime`)
- **⚙️ Commission (Scaled Int)** (`formula`) — formula: `IF({fldUEuJ9Bt9jUohLn}, ROUND({fldkD6wCp977Fjpfm} * 100, 0), BLANK())` → result `number`
- **⚙️ Commission (Dollars)** (`formula`) — formula: `IF({fldUEuJ9Bt9jUohLn}, INT({fldwGGwISSK1ekw8T} / 100), BLANK())` → result `number`
- **⚙️ Commission (Cents)** (`formula`) — formula: `IF(   {fldUEuJ9Bt9jUohLn},    IF(     ROUND({fldwGGwISSK1ekw8T} - {fldlU0C0DTr25e0sj} * 100, 0) < 10,     "0" & ROUND({fldwGGwISSK1ekw8T} - {fldlU0C0DTr25e0sj} * 100, 0),     "" & ROUND({fldwGGwISSK1e…` → result `singleLineText`
- **⚙️ Commission Amount Formatted Str** (`formula`) — formula: `IF(   {fldUEuJ9Bt9jUohLn},   "$" & {fldlU0C0DTr25e0sj} & "." & {fldnKCcJTB5rK71GC},   BLANK() )` → result `singleLineText`
- **(People) Current SL Position** (`multipleLookupValues`) — multi-lookup via `fldVQa8YVCOIxkSNL`
- **Commission [SL]** (`formula`) — formula: `IF({fldt005QCaDsbWQc5} = "SL", IF(AND({fldS1kCAqW0eW838G}, {fldtZflojtZcjdCZa} = "Closed", NOT({fldRnMKJnmBscZnof})), {fldHutuTunOyaRs7j} * {fld9LBmd3KyCbDbZx}, 0), BLANK())` → result `currency`
- **Override Commission Str** (`formula`) — formula: `{fldkbxynN4jgwCLOZ} & ""` → result `singleLineText`
- **Is Commission?** (`formula`) — formula: `NOT(OR({fldt005QCaDsbWQc5} = "ADJ", {fldt005QCaDsbWQc5} = "PAY"))` → result `checkbox`
- **Requires Job?** (`formula`) — formula: `OR({fldt005QCaDsbWQc5} = "SL", {fldt005QCaDsbWQc5} = "SM",  {fldt005QCaDsbWQc5} = "REF")` → result `checkbox`
- **Requires Project?** (`formula`) — formula: `OR({fldt005QCaDsbWQc5} = "PM", {fldt005QCaDsbWQc5} = "PMM")` → result `checkbox`
- **Prefix** (`formula`) — formula: `IF(   OR(     LEN({fldVQa8YVCOIxkSNL}) = 0,     AND({fldH7cv83xDqmH6SX}, LEN({fldMsLL7pAVT5IxQU}) = 0),     AND({fldGyvhbigTKJun6y}, LEN({fldcwwUB8jjzwnxbs})=0)   ),   "⚠️ " )` → result `singleLineText`
- **⚙️ Disbursement Formatted Str** (`formula`) — formula: `IF(   {fldUEuJ9Bt9jUohLn},   BLANK(),    IF(     {fldsks5L0A9TSYosS} < 0,     "-$" & ABS({fldNpkAyCYb3CKmfs}) & "." & {fld5HbHDHzv4kDohW},     "$" & {fldNpkAyCYb3CKmfs} & "." & {fld5HbHDHzv4kDohW}   )…` → result `singleLineText`
- **⚙️ Amount Formatted Str** (`formula`) — formula: `IF(   {fldUEuJ9Bt9jUohLn},   {fld1W6WfwKW1hPxTT},   {fldqCKbqmEXgpJyGW} )` → result `singleLineText`
- **Raw Disbursement** (`currency`)
- **⚙️ Disbursement (Scaled Int)** (`formula`) — formula: `IF({fldUEuJ9Bt9jUohLn}, BLANK(), ROUND({fldsks5L0A9TSYosS} * 100, 0))` → result `number`
- **Disbursement** (`formula`) — formula: `IF(   {fldt005QCaDsbWQc5} = "PAY",   ABS({fldwVe8gyCtsYZGl0}) * -1,   {fldwVe8gyCtsYZGl0} )` → result `currency`
- **⚙️ Disbursement (Dollars)** (`formula`) — formula: `IF({fldUEuJ9Bt9jUohLn}, BLANK(),     IF({fldtF2dpXzx5Y2vji} >= 0,       INT({fldtF2dpXzx5Y2vji} / 100),       -INT(ABS({fldtF2dpXzx5Y2vji} / 100))     )   )` → result `number`
- **⚙️ Disbursement (Cents)** (`formula`) — formula: `IF(     {fldUEuJ9Bt9jUohLn},     BLANK(),     IF(       ABS({fldtF2dpXzx5Y2vji} - {fldNpkAyCYb3CKmfs} * 100) <   10,       "0" & ABS({fldtF2dpXzx5Y2vji} - {fldNpkAyCYb3CKmfs} *   100),       "" & ABS(…` → result `singleLineText`
- **Commission [SM]** (`formula`) — formula: `IF({fldt005QCaDsbWQc5} = "SM", IF(AND({fldS1kCAqW0eW838G}, {fldtZflojtZcjdCZa} = "Closed", NOT({fldRnMKJnmBscZnof}), NOT({fldk1ZXLDazjGicLb} = "Seth Williams")), {fldJuqNcrkMpcpjkA} * 0.0075, 0), BLAN…` → result `currency`
- **(Job) Sales Rep** (`multipleLookupValues`) — multi-lookup via `fldMsLL7pAVT5IxQU`
- **(Job) Gross Profit $** (`multipleLookupValues`) — multi-lookup via `fldMsLL7pAVT5IxQU`
- **Base Commission [PM]** (`formula`) — formula: `IF(   {fldt005QCaDsbWQc5} = "PM",   IF(     AND(       {fldHmsZD5qC03aNw2},       {fldCBFc0ak2hTsTjK} = 0,       NOT({fldcGZrqh4JS0MIpS} = "Cancelled")     ),     {fldz7ieQRLSZd9fl0} * {fldecCGr8sKUMK…` → result `currency`
- **Commission Tier % [PM]** (`formula`) — formula: `SWITCH(   {fldFnAQyYNsF8UDXy},   "PM1", 0.02,   0 )` → result `percent`
- **Commission Tier % [PMM]** (`formula`) — formula: `SWITCH(   {fldFnAQyYNsF8UDXy},   "PMM1", 0.02,   0 )` → result `percent`
- **(Employee) Employee Full Name** (`multipleLookupValues`) — multi-lookup via `fldVQa8YVCOIxkSNL`
- **Project** (`multipleRecordLinks`) — links → `tblLhQVFqQgtEStvn`
- **(People) Current PM Position** (`multipleLookupValues`) — multi-lookup via `fldVQa8YVCOIxkSNL`
- **(Project) Gross Profit $** (`multipleLookupValues`) — multi-lookup via `fldcwwUB8jjzwnxbs`
- **(Project) GP Qualified** (`formula`) — formula: `ROUND({fldzzZMBek3cbLwkm} * 100, 4) >= 40` → result `checkbox`
- **(Project) Project Status** (`multipleLookupValues`) — multi-lookup via `fldcwwUB8jjzwnxbs`
- **(Project) Is Project Status Active?** (`multipleLookupValues`) — multi-lookup via `fldcwwUB8jjzwnxbs`
- **(Project) Project Amount to Job Amount Ratio** (`multipleLookupValues`) — multi-lookup via `fldcwwUB8jjzwnxbs`
- **(Project) Google Review Stars** (`multipleLookupValues`) — multi-lookup via `fldcwwUB8jjzwnxbs`
- **5-Star Review Bonus [PM/PMM]** (`formula`) — formula: `IF(   OR({fldt005QCaDsbWQc5} = "PM", {fldt005QCaDsbWQc5} = "PMM"),   IF(     AND(       {fldXC0OzwzWcwpioV} > 0,       {fldbcHlTcgStyTNRF} = 5     ),     50 * {fldXC0OzwzWcwpioV},     0   ),   BLANK()…` → result `currency`
- **Commission [PM]** (`formula`) — formula: `IF(   {fldt005QCaDsbWQc5} = "PM",   {fld8xbxTHHgLR75Mo} + {fldby12ic60jREPmn},   BLANK() )` → result `currency`
- **(Project) Project Number** (`multipleLookupValues`) — multi-lookup via `fldcwwUB8jjzwnxbs`
- **Base Commission [PMM]** (`formula`) — formula: `IF(   {fldt005QCaDsbWQc5} = "PMM",   IF(     AND(       {fldHmsZD5qC03aNw2},       {fldCBFc0ak2hTsTjK} = 0,       NOT({fldcGZrqh4JS0MIpS} = "Cancelled")     ),     {fldz7ieQRLSZd9fl0} * {fldxI7WTWKWCF…` → result `currency`
- **Commission [PMM]** (`formula`) — formula: `IF(   {fldt005QCaDsbWQc5} = "PMM",   {fld8xbxTHHgLR75Mo} + {fldocTKYnypwLRMhM},   BLANK() )` → result `currency`
- **Commission [REF]** (`formula`) — formula: `IF(   {fld31Z1OxC8KvWNW4} = "Referral Bonus (REF)",   IF(     OR(       {fldVDnao74dIPq2Dp} & "" = "SL1",       {fldVDnao74dIPq2Dp} & "" = "SL2",       {fldVDnao74dIPq2Dp} & "" = "SM1"     ),     0,  …` → result `currency`
- **(Job) Referral Name** (`multipleLookupValues`) — multi-lookup via `fldMsLL7pAVT5IxQU`
- **(Project) Total Project Amount** (`multipleLookupValues`) — multi-lookup via `fldcwwUB8jjzwnxbs`
- ****Referral Name** (`multilineText`)
- **(Jobs) Source** (`multipleLookupValues`) — multi-lookup via `fldMsLL7pAVT5IxQU`
- **(Project) Total Project Expense** (`multipleLookupValues`) — multi-lookup via `fldcwwUB8jjzwnxbs`
- **(Project) Job Gross Profit %** (`multipleLookupValues`) — multi-lookup via `fldcwwUB8jjzwnxbs`
- **(Project) Total Job Amount** (`multipleLookupValues`) — multi-lookup via `fldcwwUB8jjzwnxbs`
- **Quarter** (`formula`) — formula: `IF({fldl2KWLtit2sNiYm}, YEAR({fldl2KWLtit2sNiYm}) & "-Q" & CEILING(MONTH({fldl2KWLtit2sNiYm})/3), BLANK())` → result `singleLineText`
- **Commission Overriden by Seth?** (`formula`) — formula: `IF({fldE0CJbPiWGMItjK}, TRUE(), FALSE())` → result `checkbox`
- **Commission Admin** (`multipleCollaborators`)
- **Manual Disbursement Date** (`date`)
- **Disbursement Date** (`formula`) — formula: `IF(OR({fld31Z1OxC8KvWNW4} = "Payout (PAY)", {fld31Z1OxC8KvWNW4} = "Adjustment (ADJ)"), IF({fld1BpihJhEleyQ37}, {fld1BpihJhEleyQ37}, {fldp7TvOOpvXDbZCy}), BLANK())` → result `dateTime`
- **Notes** (`multilineText`)
- **Manual Commission** (`currency`)
- **(Employee) Airtable Owner User** (`multipleLookupValues`) — multi-lookup via `fldVQa8YVCOIxkSNL`
- **(Employee) Airtable Manager User** (`multipleLookupValues`) — multi-lookup via `fldVQa8YVCOIxkSNL`
- **(Employee) Airtable User** (`multipleLookupValues`) — multi-lookup via `fldVQa8YVCOIxkSNL`
- **⚙️ Date** (`formula`) — formula: `IF(   {fldOl5QZBsM3qwUNA}, {fldOl5QZBsM3qwUNA},   IF({fldDXx8zX4RqCdWfN}, {fldDXx8zX4RqCdWfN},     {fldp7TvOOpvXDbZCy}   ) )` → result `dateTime`
- **(Job) GP Qualified Notes** (`formula`) — formula: `IF({fldpA0FkBTczed1K1}, IF(ROUND({fldpA0FkBTczed1K1} * 100, 4) >= 40, BLANK(), "❌ Gross Profit Not Qualified"), BLANK())` → result `singleLineText`
- **(Project) GP Qualified Notes** (`formula`) — formula: `IF({fldzzZMBek3cbLwkm}, IF(ROUND({fldzzZMBek3cbLwkm} * 100, 4) >= 40, BLANK(), "❌ Gross Profit Not Qualified"), BLANK())` → result `singleLineText`
- **(Project) Job Gross Profit $** (`multipleLookupValues`) — multi-lookup via `fldcwwUB8jjzwnxbs`
- **Employee Assigned** (`formula`) — formula: `IF({fldVQa8YVCOIxkSNL}, TRUE(), FALSE())` → result `checkbox`
- **Job: Customer** (`multipleLookupValues`) — multi-lookup via `fldMsLL7pAVT5IxQU`
- **Job: Won Date** (`multipleLookupValues`) — multi-lookup via `fldMsLL7pAVT5IxQU`
- **Job: HS Deal ID** (`multipleLookupValues`) — multi-lookup via `fldMsLL7pAVT5IxQU`
- **(Job) Job Name Only** (`multipleLookupValues`) — multi-lookup via `fldMsLL7pAVT5IxQU`
- **(Project) Job Name Only** (`multipleLookupValues`) — multi-lookup via `fldcwwUB8jjzwnxbs`
- **(Job) Project Status Last Modified Date Rollup** (`multipleLookupValues`) — multi-lookup via `fldMsLL7pAVT5IxQU`
- **(Project) Project Status Last Modified Date** (`multipleLookupValues`) — multi-lookup via `fldcwwUB8jjzwnxbs`
- **⚙️ Current Quarter** (`formula`) — formula: `{fldGl2KvuDMNPX5p1} = YEAR(NOW()) & "-Q" & CEILING(MONTH(NOW())/3)` → result `checkbox`
