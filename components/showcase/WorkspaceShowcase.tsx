import {
  BadgeCheck,
  CreditCard,
  FileText,
  MessageSquare,
  UserPlus,
} from "lucide-react";
import { Workspace } from "@/components/workspace/Workspace";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { TabbedContentArea } from "@/components/workspace/TabbedContentArea";
import { TimelineArea } from "@/components/workspace/TimelineArea";
import { SummaryPanel } from "@/components/workspace/SummaryPanel";
import { ActionPanel } from "@/components/workspace/ActionPanel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Muted, Text } from "@/components/ui/Typography";

/**
 * Demonstrates the reusable Workspace skeleton with a mock customer record:
 * header + tabbed content (main) + timeline, with a summary + action rail.
 * Pure layout demonstration — no record actually exists.
 */
export function WorkspaceShowcase() {
  return (
    <Workspace
      header={
        <WorkspaceHeader
          eyebrow="Customer · CUS-2041"
          title="Thandi Mokoena"
          badges={
            <>
              <Badge tone="warning" dot>
                Identity pending
              </Badge>
              <Badge tone="neutral">Member since Jan 2026</Badge>
            </>
          }
          actions={
            <>
              <Button variant="outline" size="sm">
                <MessageSquare className="h-4 w-4" aria-hidden />
                Message
              </Button>
              <Button size="sm">
                <BadgeCheck className="h-4 w-4" aria-hidden />
                Verify identity
              </Button>
            </>
          }
        />
      }
      summary={
        <SummaryPanel
          items={[
            { label: "Status", value: <StatusBadge status="IN_PROGRESS" /> },
            { label: "Identity", value: "Pending review" },
            { label: "Card", value: "Not issued" },
            { label: "Membership", value: "Active" },
            { label: "Joined", value: "12 Jan 2026" },
          ]}
        />
      }
      actions={
        <ActionPanel>
          <Button variant="secondary" size="sm">
            <BadgeCheck className="h-4 w-4" aria-hidden />
            Verify identity
          </Button>
          <Button variant="secondary" size="sm">
            <CreditCard className="h-4 w-4" aria-hidden />
            Issue card
          </Button>
          <Button variant="secondary" size="sm">
            <UserPlus className="h-4 w-4" aria-hidden />
            Add guardian
          </Button>
        </ActionPanel>
      }
      timeline={
        <TimelineArea
          events={[
            {
              id: "t1",
              time: "2h ago",
              title: "Identity document submitted",
              description: "Awaiting officer review.",
              icon: BadgeCheck,
            },
            {
              id: "t2",
              time: "12 Jan",
              title: "Account claimed",
              description: "Customer completed onboarding.",
              icon: UserPlus,
            },
            {
              id: "t3",
              time: "12 Jan",
              title: "Invited by practitioner",
              icon: FileText,
            },
          ]}
        />
      }
    >
      <TabbedContentArea
        tabs={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <div className="space-y-3">
                <Text>
                  Profile is 80% complete. Identity verification is the only
                  outstanding step before a card can be issued.
                </Text>
                <Muted>
                  This is mock content demonstrating the tabbed content area.
                </Muted>
              </div>
            ),
          },
          {
            id: "documents",
            label: "Documents",
            content: (
              <EmptyState
                icon={FileText}
                title="No documents yet"
                description="Uploaded identity and supporting documents will appear here."
              />
            ),
          },
          {
            id: "notes",
            label: "Notes",
            content: (
              <EmptyState
                icon={MessageSquare}
                title="No notes"
                description="Internal notes about this customer will appear here."
              />
            ),
          },
        ]}
      />
    </Workspace>
  );
}
