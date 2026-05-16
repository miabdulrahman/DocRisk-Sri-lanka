# Guardian Firestore schema

Reference schema for **DocRisk Guardian** circles, protected members, public check requests, and guardian notifications.

Paths use `{guardianId}` as the Firebase Auth **uid** of the guardian.

---

## Collection: `circles/{guardianId}`

Top-level document — one circle per guardian (document id equals guardian’s uid).

| Field          | Type        | Description                          |
|----------------|-------------|--------------------------------------|
| `guardianName` | `string`    | Display name for the guardian        |
| `createdAt`    | `timestamp` | When the circle was created          |
| `memberCount`  | `number`    | Cached count of members (optional)   |

---

## Collection: `circles/{guardianId}/members/{memberId}`

Protected people under a guardian’s circle.

| Field           | Type                        | Description |
|-----------------|-----------------------------|-------------|
| `name`          | `string`                    | e.g. `"Grandmother Nanda"` |
| `phone`         | `string`                    | e.g. `"+94771234567"` |
| `relationship`  | `string`                    | `"grandmother"` \| `"child"` \| `"parent"` \| `"other"` |
| `memberToken`   | `string`                    | UUID — authenticates this member’s check requests |
| `checkLink`     | `string`                    | e.g. `https://app.docrisk.lk/check?token={memberToken}` |
| `addedAt`       | `timestamp`                 | When the member was added |
| `totalChecks`   | `number`                    | Running count of checks |
| `lastCheckAt`   | `timestamp` \| `null`       | Last completed check time |
| `isActive`      | `boolean`                   | Whether the member link is active |

---

## Collection: `check_requests/{requestId}`

Queued work for analyzing a link or document on behalf of a member. **Clients may create** documents without Firebase Auth (see rules); reads/updates require an authenticated user (typically backend or guardian flows).

| Field               | Type | Description |
|---------------------|------|-------------|
| `memberToken`       | `string` | Must match a member’s `memberToken` under the guardian |
| `guardianId`        | `string` | Guardian uid owning the circle |
| `memberName`        | `string` | Denormalized for display / notifications |
| `type`              | `"link"` \| `"document"` | Input kind |
| `input`             | `string` | URL string **or** base64 image payload |
| `mimeType`          | `string` \| `null` | When `type === "document"`, e.g. `image/jpeg` |
| `status`            | `"pending"` \| `"analyzing"` \| `"done"` \| `"error"` | Pipeline state |
| `result`            | `AnalysisResult` \| `null` | Populated when `status === "done"` |
| `createdAt`         | `timestamp` | Creation time |
| `completedAt`       | `timestamp` \| `null` | When analysis finished |
| `guardianNotified`  | `boolean` | Whether a notification was written for the guardian |

### `AnalysisResult`

Same shape as the main DocRisk analyze API / `users/.../analyses` results. In TypeScript this matches `AnalysisResult` in `client/src/types.ts`:

| Field                 | Type        | Notes |
|-----------------------|-------------|--------|
| `document_type`       | `DocumentType` | e.g. `nic`, `job_offer`, `other` |
| `risk_score`          | `number`    | 0–100 |
| `confidence`          | `number`    | 0–100 |
| `risk_level`          | `"low"` \| `"medium"` \| `"high"` | |
| `summary`             | `string`    | | 
| `red_flags`           | `string[]`  | | 
| `explanation`         | `string`    | | 
| `recommended_action`  | `string`    | | 
| `extracted_data`      | object (optional) | Extracted ID fields |
| `tamper_coordinates`  | array (optional)  | Tamper bounding boxes |

---

## Collection: `notifications/{guardianId}/items/{notifId}`

In-app notifications for a guardian. Path: **collection** `notifications` → **document** `guardianId` → **subcollection** `items` → **document** `notifId`.

| Field         | Type | Description |
|---------------|------|-------------|
| `type`        | `"check_completed"` \| `"member_added"` | Notification kind |
| `memberName`  | `string` | Who the event concerns |
| `checkType`   | `"link"` \| `"document"` | Present for check-related types |
| `riskLevel`   | `"low"` \| `"medium"` \| `"high"` \| `null` | From analysis when applicable |
| `requestId`   | `string` | Reference to `check_requests/{requestId}` |
| `read`        | `boolean` | Read state |
| `createdAt`   | `timestamp` | When the notification was created |

---

## Security rules summary

| Path | Client access |
|------|----------------|
| `circles/{guardianId}` | Guardian only (`auth.uid == guardianId`) |
| `circles/{guardianId}/members/{memberId}` | Guardian only |
| `check_requests/{requestId}` | Anyone can **create**; **read/update** requires signed-in user (tighten in production if only backend should process) |
| `notifications/{guardianId}/items/{notifId}` | Guardian only |

See root `firestore.rules` for the authoritative rules.

---

## Deployment

After editing rules locally:

```bash
firebase deploy --only firestore:rules
```

Ensure `firebase.json` points at this `firestore.rules` file.
