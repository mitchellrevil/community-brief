# Model catalogue administration

Admins (including Moderators) can open **Templates → Models** to register an Azure deployment, edit its default arguments and define the controls that template editors can override. Use **Save model catalogue** to apply the draft to all templates. Editing a template's **Settings** is separate: Apply settings updates the template draft, and saving the template persists those changes.

All deployments use the application's existing Azure endpoint and credentials. Register the exact name of a deployment that already exists there. Responses and Chat completions are supported; adding another request protocol still requires an adapter. The catalogue does not provision Azure resources or store credentials.

Default arguments are JSON request fields. Nested objects, arrays, booleans, strings and numbers are forwarded through both ordinary analysis and structured review. New provider fields use the SDK's JSON body extension so the application does not need a release just to recognise an argument name. Azure remains responsible for deciding whether the deployed model supports an argument.

For example, a Responses model can use:

```json
{
  "reasoning": { "effort": "high", "summary": "auto" },
  "max_output_tokens": 8000
}
```

Editable parameters define which overrides template editors can set:

```json
{
  "max_output_tokens": {
    "kind": "integer",
    "label": "Output limit",
    "description": "Maximum output tokens for this template.",
    "default": 8000,
    "min": 1,
    "max": 32000,
    "conflicts_with": []
  },
  "reasoning": {
    "kind": "object",
    "label": "Reasoning arguments",
    "description": "Detailed reasoning options for this template.",
    "conflicts_with": []
  }
}
```

Supported kinds are `enum`, `number`, `integer`, `boolean`, `string`, `object` and `array`. Enums provide `values`; numeric fields can provide `min` and `max`. A `depends_on` definition contains `parameter`, `value` and an optional `message`. `conflicts_with` names controls that cannot be used together. The parameter `default` describes the model default for the UI; only **Default arguments** and explicit template overrides are sent. Object overrides merge recursively with default arguments; other values replace them. Existing `reasoning_effort` and `verbosity` aliases remain compatible with Responses requests.

Request content (`model`, `input`, `messages`, `instructions`), credentials, client options, tools and execution mode are owned by Community Brief and cannot be replaced by model arguments. Arguments are limited to 64 KB and must contain finite JSON values.

| Status | New template selection | Existing template analysis |
| --- | --- | --- |
| Active | Allowed | Allowed |
| Deprecated | Blocked | Allowed until retirement |
| Disabled | Blocked | Blocked |
| Retired | Blocked | Blocked |

Deprecation and retirement can also be scheduled at midnight UTC on the selected date. Set a replacement to help editors migrate and select an active default before retiring the current default. An expired default remains readable so admins can repair it. Models referenced by templates cannot be removed from the catalogue; retire them to stop all future use while retaining history.

Workers read the current catalogue before starting analysis or reprocessing. A catalogue read failure prevents new analysis; a stale cached configuration cannot bypass a retirement. Work already running may finish. Browser catalogues refresh periodically and after an admin save; backend checks remain authoritative.

Writes require admin permission and the revision (`ETag` / `If-Match`) loaded with the draft. A concurrent change returns 412 without overwriting the newer catalogue. The UI preserves the rejected draft and offers an explicit discard-and-reload action.
