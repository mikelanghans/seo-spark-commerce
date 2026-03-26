import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import brandAuraIcon from "@/assets/brand-aura-icon-new.png";

const Terms = () => (
  <div className="min-h-screen bg-background px-4 py-12">
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center gap-3">
        <Link to="/auth">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <img src={brandAuraIcon} alt="Brand Aura" className="h-8 w-8 object-contain" />
          <h1 className="text-2xl font-bold text-foreground">Terms of Service</h1>
          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary uppercase tracking-wider">
            Beta
          </span>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">Last updated: March 26, 2026</p>

      <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">1. Beta Disclaimer</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Brand Aura is currently in <strong className="text-foreground">public beta</strong>. Features, functionality, and availability may change at any time without notice. By using this service you acknowledge that it is a beta product and may contain bugs, errors, or incomplete features.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">2. Service Provided "As-Is"</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Brand Aura is provided on an <strong className="text-foreground">"as-is" and "as-available"</strong> basis without warranties of any kind, whether express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, or non-infringement.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">3. AI-Generated Content</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Brand Aura uses artificial intelligence to generate product listings, descriptions, designs, mockups, and other content. <strong className="text-foreground">You are solely responsible</strong> for reviewing, editing, and approving all AI-generated content before publishing or using it commercially. We make no guarantees regarding the accuracy, quality, originality, or legal compliance of AI-generated outputs.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">4. Third-Party Services</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Brand Aura integrates with third-party platforms including but not limited to Shopify, Printify, Etsy, eBay, and Meta. These integrations are provided for convenience. <strong className="text-foreground">You are responsible</strong> for complying with each platform's terms of service, policies, and guidelines. We are not responsible for any actions taken by third-party services, including account suspensions, listing removals, or data loss.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">5. Limitation of Liability</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            To the fullest extent permitted by law, Brand Aura and its creators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, revenue, data, or business opportunities arising from your use of the service. This includes, without limitation, damages resulting from:
          </p>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            <li>Errors or inaccuracies in AI-generated content</li>
            <li>Marketplace listing issues, pricing errors, or sync failures</li>
            <li>Third-party platform outages or policy changes</li>
            <li>Unauthorized access to your account</li>
            <li>Loss of data or product information</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">6. User Responsibility</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You are responsible for all activity under your account, including product listings, pricing, intellectual property compliance, and marketplace conduct. You agree not to use Brand Aura for any unlawful purpose or in violation of any applicable regulations.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">7. Data & Privacy</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We store data necessary to provide the service, including your account information, product data, and marketplace credentials (encrypted). We do not sell your data. During beta, data retention and backup policies may be limited.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">8. Changes to Terms</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We reserve the right to modify these terms at any time. Continued use of the service after changes constitutes acceptance of the updated terms.
          </p>
        </section>

        <section className="rounded-lg border border-border bg-muted/50 p-4 space-y-1">
          <p className="text-sm font-medium text-foreground">Questions?</p>
          <p className="text-sm text-muted-foreground">
            If you have questions about these terms, please reach out through the in-app support form.
          </p>
        </section>
      </div>
    </div>
  </div>
);

export default Terms;
