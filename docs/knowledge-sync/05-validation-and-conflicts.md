# Validation & Conflict Detection

## Content Validation

The Content Validator applies 9 categories of validation to every extracted article:

### Validation Categories

| # | Category | Checks |
|---|---|---|
| 1 | **Minimum Length** | Answer ≥ 50 characters |
| 2 | **Maximum Length** | Answer ≤ 10,000 characters |
| 3 | **Valid Category** | Category must match known categories |
| 4 | **Valid Mode** | Mode must be `sales`, `support`, or `both` |
| 5 | **Valid Priority** | Priority must be 1–10 |
| 6 | **Prompt Injection** | 10 patterns including "ignore previous instructions", "reveal system prompt", "override company policy", "you are now", "pretend you are", etc. |
| 7 | **Secret Detection** | API keys, tokens, connection strings, private keys, credentials, `-----BEGIN` |
| 8 | **System References** | References to localhost, 127.0.0.1, internal domains, staging URLs |
| 9 | **HTML/Script Injection** | `<script>`, `<iframe>`, `<embed>`, `<object>`, `onerror=`, `onclick=` |
| 10 | **Unsupported Claims** | "guaranteed", "best", "fastest", "100%", price claims |
| 11 | **Placeholder Detection** | Lorem ipsum, todo, TBD, placeholder text |
| 12 | **HTTP URL Warning** | Non-HTTPS URLs (warning, not error) |

### Validation Result

```js
{
  passed: true|false,
  safe: true|false,  // false if injection/secrets/system refs found
  errors: string[],
  warnings: string[]
}
```

## Conflict Detection

### Duplicate Detection

- **Exact hash match**: contentHash matches an existing APPROVED/ACTIVE article → `DUPLICATE`
- **Near duplicate**: answer similarity > 85% (Jaccard coefficient on word sets) → `DUPLICATE`

### Change Detection

Field-level comparison between staged and approved versions:

- Same contentHash → `UNCHANGED`
- No prior version → `NEW`
- Different contentHash but similar answer (>50%) → `UPDATED`
- Answer similarity < 50% → `CONFLICT`
- Mode or priority changes → `CONFLICT`

### Curated Article Conflicts

The system detects conflicting claims with curated engine articles by checking for:
- Partial answer overlap AND different mode assignment
- Answer answer fields that contradict existing curated articles on the same category
