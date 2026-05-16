export type Severity = 'High' | 'Medium' | 'Low'

export interface ScamEntry {
  id: string
  title: string
  category: string
  severity: Severity
  description: string
  explanation: string
  lastUpdated: string
}

export const SCAMS: ScamEntry[] = [
  {
    id: 'sri-lanka-post-customs-sms',
    title: 'Sri Lanka Post Customs Clearance SMS Scam',
    category: 'SMS Phishing',
    severity: 'High',
    description:
      'Victims receive fake SMS messages claiming to be from Sri Lanka Post, demanding customs fees to release a package via a fraudulent payment link.',
    explanation:
      'This scam targets Sri Lankans who have recently ordered goods from overseas. Victims receive an SMS or WhatsApp message appearing to be from Sri Lanka Post or a courier company, stating that their parcel is held at customs and a clearance fee (typically LKR 1,500–5,000) must be paid within 24 hours via a provided link. The link leads to a convincing fake payment portal designed to harvest credit card details or bank credentials. Sri Lanka Post and the Department of Customs have publicly confirmed they never request payment via SMS links. Victims who pay the fee typically lose their money and receive no parcel. The scam has been active since 2023 and surged in 2025–2026 following increased international e-commerce activity after the economic recovery. Victims should report incidents directly to the CID Cybercrime Division and SLCERT at info@cert.gov.lk.',
    lastUpdated: '2026-05-10',
  },
  {
    id: 'fake-crypto-colombo',
    title: '"ColomboTrade Pro" Fake Crypto Investment Platform',
    category: 'Investment Fraud',
    severity: 'High',
    description:
      'A fraudulent crypto platform targeting Colombo investors promises guaranteed 30–50% monthly returns, then disappears with deposited funds.',
    explanation:
      'Operating under the brand "ColomboTrade Pro" (and similar aliases), this investment fraud recruits victims through Facebook groups, Telegram channels, and word-of-mouth in Colombo, Gampaha, and Kandy. The scheme presents a professional-looking trading dashboard showing fabricated profits. Victims are encouraged to invest as little as USD 200 initially; once trust is established, they are pressured to deposit larger sums. Withdrawal requests are rejected with claims of "tax clearance fees" or "account verification" requirements — classic advance-fee fraud patterns. Sri Lanka\'s Securities and Exchange Commission (SEC) has issued warnings, as the platform is not registered with any regulatory body. Losses across identified victims exceed LKR 180 million as of early 2026. Citizens should verify any investment platform\'s registration at sec.gov.lk before depositing funds.',
    lastUpdated: '2026-04-28',
  },
  {
    id: 'fake-middle-east-job-offer',
    title: 'Fake Middle East Employment Agency Job Offer',
    category: 'Job Offer Fraud',
    severity: 'High',
    description:
      'Fraudulent employment agencies issue forged offer letters for high-paying jobs in UAE or Saudi Arabia, collecting large upfront fees before victims travel.',
    explanation:
      'This long-running scam exploits the significant demand for overseas employment among Sri Lankans. Fraudulent agents — sometimes posing as registered Sri Lanka Bureau of Foreign Employment (SLBFE) agencies — produce convincing forged job offer letters on letterhead mimicking legitimate UAE or Saudi companies. Victims are asked to pay "visa processing," "medical clearance," and "training fees" totaling LKR 200,000–500,000. In some cases, victims travel abroad only to find the employer does not exist or the job conditions are exploitative. The Sri Lanka Police CID and SLBFE have jointly warned citizens to verify agency registration numbers at slbfe.lk and to never pay fees directly to agents. This scam spiked in 2025–2026 due to economic pressure pushing many Sri Lankans to seek overseas work. Always cross-check any offer letter against the company\'s official website and contact the SLBFE hotline 1977 for free verification.',
    lastUpdated: '2026-05-01',
  },
  {
    id: 'fake-bank-of-ceylon-notice',
    title: 'Fake Bank of Ceylon Account Suspension Notice',
    category: 'Bank Phishing',
    severity: 'Medium',
    description:
      'Scammers send convincing fake emails and SMS posing as Bank of Ceylon, warning of account suspension and directing victims to credential-harvesting sites.',
    explanation:
      'Victims receive official-looking emails or SMS messages appearing to originate from Bank of Ceylon (BOC), the largest state-owned bank in Sri Lanka. The message claims the recipient\'s account will be suspended within 48 hours due to "suspicious activity" or failure to complete a mandatory KYC update. A link in the message directs victims to a near-identical replica of the real BOC online banking portal. Once credentials are entered, attackers immediately access the victim\'s account and initiate fund transfers. Bank of Ceylon has publicly stated it never requests login credentials via email or SMS and that all KYC updates are performed in-branch or via the official app. The SLCERT (Sri Lanka Computer Emergency Readiness Team) classifies this as one of the top three active phishing campaigns targeting Sri Lankan banking customers in 2026. Immediately contact BOC on 011-2204444 if you suspect you have received such a message.',
    lastUpdated: '2026-05-12',
  },
]
