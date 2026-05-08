filepath = "/opt/projects/saas immo/frontend/project/components/dashboard/ResultsList.tsx"

with open(filepath, "r") as f:
    content = f.read()

# 1. Add Link import
content = content.replace(
    "import { useState } from 'react'",
    "import { useState } from 'react'\nimport Link from 'next/link'",
    1
)

# 2. Add Mail to lucide imports
content = content.replace(
    "ChevronDown, ChevronUp, ExternalLink",
    "ChevronDown, ChevronUp, ExternalLink, Mail",
    1
)

print("Imports patched OK")

# 3. Verify the actions block exists
if "{result.id && !result.revealed && (" in content and "Courrier" not in content:
    # Find and replace the closing of the actions div
    old = """                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}"""
    # We need to find the right closing. Let me do targeted replacement
    pass

with open(filepath, "w") as f:
    f.write(content)

print("Imports done. Will do actions separately.")
