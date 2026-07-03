import type { Metadata } from "next";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { config, isCognitoConfigured } from "@/lib/config";
import { OPS_ROLES, roleMeta } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Administration" };

/**
 * Administration — the platform's own operational state: how the runtime
 * resolved its adapters (secret-free booleans only — never ids, names, or
 * tokens) and the staff role vocabulary Cognito groups must match. Read-only;
 * user management lives in Cognito (operator-owned).
 */
export default function AdministrationPage() {
  const adapters = [
    { label: "Authentication", mock: config.useMockAuth, live: "Cognito" },
    { label: "Data", mock: config.useMockData, live: "DynamoDB" },
    { label: "Uploads", mock: config.useMockUploads, live: "S3" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administration"
        description="Runtime configuration and the staff role reference. Staff accounts are managed in Cognito; practitioner accounts are created here by the EMRID team (V1: internal only)."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="space-y-3">
          <CardTitle>Runtime adapters</CardTitle>
          <ul className="divide-y divide-border">
            <li className="flex items-center justify-between py-2.5 text-sm">
              <span className="font-medium text-foreground">Environment</span>
              <Badge tone={config.isProduction ? "success" : "neutral"}>
                {config.appEnv}
              </Badge>
            </li>
            {adapters.map((a) => (
              <li key={a.label} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium text-foreground">{a.label}</span>
                <Badge tone={a.mock ? "warning" : "success"}>
                  {a.mock ? "Mock" : a.live}
                </Badge>
              </li>
            ))}
            <li className="flex items-center justify-between py-2.5 text-sm">
              <span className="font-medium text-foreground">Cognito configuration</span>
              <Badge tone={isCognitoConfigured() ? "success" : "warning"}>
                {isCognitoConfigured() ? "Configured" : "Not configured"}
              </Badge>
            </li>
          </ul>
        </Card>
        <Card className="space-y-3">
          <CardTitle>Staff roles</CardTitle>
          <p className="text-sm text-muted-foreground">
            Roles come from Cognito groups named exactly as these tokens.
          </p>
          <ul className="divide-y divide-border">
            {OPS_ROLES.map((role) => {
              const meta = roleMeta(role);
              return (
                <li key={role} className="py-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{meta.label}</span>
                    <code className="text-xs text-muted-foreground">{role}</code>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {meta.description}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
