import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { RepoSetup } from "@/types";
import { FileList } from "@/components/FileList";
import { ScrollArea } from "@radix-ui/react-scroll-area";

interface RepoSetupFormProps {
  onSubmit: (data: RepoSetup) => void;
  onFetchRepo: (
    repoUrl: string,
    ref: string
  ) => Promise<{
    success: boolean;
    error?: string;
    repoData?: {
      name: string;
      tree: Array<{
        path: string;
        type: string;
      }>;
    };
  }>;
  disabled?: boolean;
}

export function RepoSetupForm({
  onSubmit,
  onFetchRepo,
  disabled = false,
}: RepoSetupFormProps) {
  const [formData, setFormData] = useState<RepoSetup>({
    githubRepo: "",
    githubRef: "main",
    repoName: "",
    mainGoal: "",
    specificAreas: "",
    files: [],
  });
  const [isFetching, setIsFetching] = useState(false);

  const handleInputChange = (field: keyof RepoSetup, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFilesChange = (files: RepoSetup["files"]) => {
    setFormData((prev) => ({ ...prev, files }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleFetchRepo = async () => {
    if (formData.githubRepo) {
      setIsFetching(true);
      try {
        const { repoData } = await onFetchRepo(
          formData.githubRepo,
          formData.githubRef
        );
        if (repoData) {
          const files: RepoSetup["files"] = repoData.tree
            .filter((v) => v.type === "blob")
            .map((file) => ({
              path: file.path,
              type: "file",
              status: "pending",
            }));

          setFormData((prev) => {
            return {
              ...prev,
              files,
              repoName: repoData.name || prev.repoName, // Use repo name if available
            };
          });
        }
      } finally {
        setIsFetching(false);
      }
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Repository Setup</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <ScrollArea className="h-full overflow-auto">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="githubRepo">GitHub Repository URL</Label>
                <Input
                  id="githubRepo"
                  value={formData.githubRepo}
                  onChange={(e) =>
                    handleInputChange("githubRepo", e.target.value)
                  }
                  placeholder="https://github.com/owner/repo"
                  disabled={disabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="githubRef">Branch/Tag (optional)</Label>
                <Input
                  id="githubRef"
                  value={formData.githubRef}
                  onChange={(e) =>
                    handleInputChange("githubRef", e.target.value)
                  }
                  placeholder="main"
                  disabled={disabled}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleFetchRepo}
                disabled={disabled || !formData.githubRepo || isFetching}
              >
                {isFetching ? "Fetching..." : "Fetch Repository Structure"}
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="repoName">Repository Name</Label>
              <Input
                id="repoName"
                value={formData.repoName}
                onChange={(e) => handleInputChange("repoName", e.target.value)}
                placeholder="Enter a descriptive name for this repository"
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mainGoal">Main Goal</Label>
              <Textarea
                id="mainGoal"
                value={formData.mainGoal}
                onChange={(e) => handleInputChange("mainGoal", e.target.value)}
                placeholder="What do you want to understand about this codebase?"
                disabled={disabled}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="specificAreas">Specific Areas of Interest</Label>
              <Textarea
                id="specificAreas"
                value={formData.specificAreas}
                onChange={(e) =>
                  handleInputChange("specificAreas", e.target.value)
                }
                placeholder="Any specific files, directories, or functionality you want to focus on?"
                disabled={disabled}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="files">Files</Label>
              {formData.files.length > 0 && (
                <FileList
                  files={formData.files}
                  onFilesChange={handleFilesChange}
                />
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={disabled || !formData.repoName || !formData.mainGoal}
            >
              Start Analysis
            </Button>
          </form>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
