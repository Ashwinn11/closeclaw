import { type FC } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './InfoModal.css';

export type InfoModalType = 'tos' | 'about' | 'privacy' | 'refund';

interface InfoModalProps {
  type: InfoModalType;
  onClose: () => void;
}

const TOS_CONTENT = (
  <>
    <p className="info-modal-updated">Last updated: February 2026</p>

    <h3>1. Acceptance of Terms</h3>
    <p>By accessing or using CloseClaw ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>

    <h3>2. Description of Service</h3>
    <p>CloseClaw provides dedicated AI assistant infrastructure — a private server running AI models accessible via Telegram, Discord, and Slack. We provision, maintain, and secure the infrastructure on your behalf.</p>

    <h3>3. Account Registration</h3>
    <p>You must create an account using Google Sign-In. You are responsible for maintaining the confidentiality of your account and for all activity that occurs under it. You must be at least 18 years old to use the Service.</p>

    <h3>4. Billing and Payments</h3>
    <p>Plans are billed monthly through Dodo Payments. All charges are in USD. Subscriptions renew automatically unless cancelled. API credit usage is deducted from your monthly credit balance. Credits do not roll over between billing cycles. One-time credit top-ups are non-refundable.</p>

    <h3>5. Acceptable Use</h3>
    <p>You may not use the Service to:</p>
    <ul>
      <li>Generate, distribute, or store illegal content</li>
      <li>Conduct automated attacks or abuse third-party services</li>
      <li>Attempt to reverse-engineer or exploit the infrastructure</li>
      <li>Circumvent usage limits or billing mechanisms</li>
      <li>Violate the terms of any AI provider (Anthropic, OpenAI, Google, etc.)</li>
    </ul>

    <h3>6. Privacy and Data</h3>
    <p>Your conversations run on a dedicated server assigned to you. We do not read your conversation history. Usage metadata (token counts, cost) is collected for billing purposes. See our Privacy Policy for full details.</p>

    <h3>7. Service Availability</h3>
    <p>We aim for high availability but do not guarantee uninterrupted access. Scheduled maintenance, infrastructure issues, or upstream AI provider outages may cause temporary disruptions. We are not liable for any loss caused by downtime.</p>

    <h3>8. Intellectual Property</h3>
    <p>The content you generate using the Service belongs to you. CloseClaw retains ownership of all platform code, design, and infrastructure. You may not copy, distribute, or create derivative works from the Service itself.</p>

    <h3>9. Termination</h3>
    <p>We reserve the right to suspend or terminate accounts that violate these terms. Upon cancellation, your subscription remains active until the end of the billing period. Your infrastructure is decommissioned after cancellation.</p>

    <h3>10. Limitation of Liability</h3>
    <p>CloseClaw is provided "as is." To the maximum extent permitted by law, we are not liable for indirect, incidental, or consequential damages arising from your use of the Service. Our total liability shall not exceed the amount you paid in the 30 days prior to the claim.</p>

    <h3>11. Changes to Terms</h3>
    <p>We may update these terms from time to time. Continued use of the Service after changes constitutes acceptance. Material changes will be communicated by email.</p>

    <h3>12. Contact</h3>
    <p>Questions about these terms? Email us at <a href="mailto:support@closeclaw.in">support@closeclaw.in</a>.</p>
  </>
);

const PRIVACY_CONTENT = (
  <>
    <p className="info-modal-updated">Last updated: February 2026</p>

    <h3>What We Collect</h3>
    <p>We collect your name and email address when you sign in with Google. We record usage metadata (token counts, API cost) to calculate billing. We do not store your conversation content on our servers.</p>

    <h3>How We Use It</h3>
    <p>Your account information is used to identify you, provision your dedicated server, and manage billing. Usage metadata is used solely to deduct credits and generate your usage dashboard.</p>

    <h3>Your Conversations</h3>
    <p>Conversations happen between you and your dedicated AI server. We do not have access to your conversation history. The AI providers (Anthropic, OpenAI, Google) process your messages under their own privacy policies.</p>

    <h3>Third-Party Services</h3>
    <p>We use Dodo Payments for payment processing, Supabase for account data, and Google Cloud for infrastructure. Each service operates under its own privacy policy.</p>

    <h3>Data Retention</h3>
    <p>Account data is retained while your subscription is active. After cancellation, we delete your infrastructure and associated data within 30 days. You can request deletion at any time by emailing us.</p>

    <h3>Security</h3>
    <p>Your AI server has no public IP address. All traffic is routed through our encrypted internal network. Access to your server requires your unique gateway token.</p>

    <h3>Contact</h3>
    <p>Privacy questions or data deletion requests: <a href="mailto:support@closeclaw.in">support@closeclaw.in</a>.</p>
  </>
);

const REFUND_CONTENT = (
  <>
    <p className="info-modal-updated">Last updated: February 2026</p>

    <h3>Subscription Policy</h3>
    <p>Due to the immediate cost of provisioning dedicated cloud infrastructure (GCP) and the upfront allocation of AI credits, all CloseClaw subscriptions are non-refundable. Once a subscription is started, your private server is provisioned and resources are reserved for your exclusive use.</p>
    <p>You may cancel your subscription at any time through the dashboard. Upon cancellation, your server and AI assistant will remain active until the end of your current billing period, after which your infrastructure will be decommissioned.</p>

    <h3>AI Credit Top-ups</h3>
    <p>One-time credit top-up packs ($5 to $100) are non-refundable as they are provisioned and made available for use immediately upon purchase.</p>

    <h3>Technical Issues</h3>
    <p>If you experience a persistent technical issue that prevents the use of the service, please reach out to <a href="mailto:support@closeclaw.in">support@closeclaw.in</a>. We handle these cases individually and may offer a pro-rated refund or account credit if we are unable to resolve the infrastructure issue within 48 hours.</p>
  </>
);

const ABOUT_CONTENT = (
  <>
    <div className="info-modal-about-hero">
      <img src="/logo.png" alt="CloseClaw" className="info-modal-logo" />
      <h2>CloseClaw</h2>
      <p className="info-modal-tagline">Private AI infrastructure for everyone.</p>
    </div>

    <p>CloseClaw gives you a dedicated AI assistant that runs on your own private server — always on, completely isolated, and ready on Telegram, Discord, or Slack within 60 seconds.</p>

    <p>Most people who want a self-hosted AI assistant face hours of setup: renting servers, configuring firewalls, wiring up bots, and maintaining everything when it breaks. We eliminate all of that.</p>

    <h3>What makes it different</h3>
    <p>Your assistant runs on a dedicated virtual machine that belongs to you alone. It's never shared with other users. Conversations are private by design — they never pass through our servers. We handle provisioning, uptime, updates, and security so you don't have to.</p>

    <h3>The technology</h3>
    <p>CloseClaw is built on top of <a href="https://docs.openclaw.ai" target="_blank" rel="noopener noreferrer">OpenClaw</a>, an open-source AI gateway that handles model routing, web browsing, and multi-channel integrations. Your assistant can use Claude, GPT, Gemini, and more — automatically picking the right model for each task.</p>

    <h3>Get in touch</h3>
    <p>We're a small team that cares deeply about privacy and developer experience. Reach us at <a href="mailto:support@closeclaw.in">support@closeclaw.in</a> — we read every message.</p>
  </>
);

const MODAL_CONFIG: Record<InfoModalType, { title: string; content: React.ReactNode }> = {
  tos:     { title: 'Terms of Service', content: TOS_CONTENT },
  privacy: { title: 'Privacy Policy',   content: PRIVACY_CONTENT },
  refund:  { title: 'Refund Policy',    content: REFUND_CONTENT },
  about:   { title: 'About CloseClaw',  content: ABOUT_CONTENT },
};

export const InfoModal: FC<InfoModalProps> = ({ type, onClose }) => {
  const { title, content } = MODAL_CONFIG[type];

  const modal = (
    <div className="info-modal-overlay" onClick={onClose}>
      <div className="info-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="info-modal-header">
          <h2>{title}</h2>
          <button className="info-modal-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="info-modal-body">
          {content}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};
