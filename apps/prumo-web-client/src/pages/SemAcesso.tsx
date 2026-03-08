import { useNavigate } from "react-router-dom";
import { Lock, LogOut } from "lucide-react";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n/useI18n";

const SemAcesso = () => {
  const navigate = useNavigate();
  const { role, isActive, obras, signOut } = useAuth();
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Lock className="h-5 w-5" />
            {t("noAccessTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            {t("noAccessMessage")}
          </p>

          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p>
              <strong>{t("active")}:</strong> {isActive ? t("yes") : t("no")}
            </p>
            <p>
              <strong>{t("role")}:</strong> {role ?? t("undefined")}
            </p>
            <p>
              <strong>{t("linkedProjects")}:</strong> {obras.length}
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/")}>
              {t("refreshStatus")}
            </Button>
            <Button variant="ghost" onClick={signOut}>
              <LogOut className="mr-1 h-4 w-4" />
              {t("logout")}
            </Button>
          </div>
          <LanguageSwitcher />
        </CardContent>
      </Card>
    </div>
  );
};

export default SemAcesso;
