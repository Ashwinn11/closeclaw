/**
 * useSEO — thin helper that builds the props for a react-helmet-async <Helmet>.
 * Use it to generate type-safe SEO config objects from solution data.
 *
 * Usage in a page component:
 *   const seo = useSEO({ title, description, keywords, canonical, ogUrl, jsonLd });
 *   // then spread into <Helmet> or pass to <SEOMeta seo={seo} />\
 *
 * For most pages, rendering <Helmet> directly is cleaner — this hook exists so
 * the schema-building logic lives outside the JSX.
 */

const BASE_URL = 'https://closeclaw.in';

export interface SEOConfig {
  title: string;
  description: string;
  keywords: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogUrl: string;
  ogImage: string;
  breadcrumbSchema: object;
  webPageSchema: object;
  faqSchema: object | null;
  serviceSchema: object | null;
}

interface UseSEOOptions {
  title: string;
  description: string;
  keywords?: string[];
  path: string;
  industry?: string;
  location?: string;
  industryFaqs?: Array<{ q: string; a: string }>;
}

export function useSEO({
  title,
  description,
  keywords = [],
  path,
  industry,
  location,
  industryFaqs,
}: UseSEOOptions): SEOConfig {
  const canonical = `${BASE_URL}${path}`;
  const ogTitle = `${title} | CloseClaw`;

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${canonical}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: industry ? `${industry} AI Solutions` : title,
        item: canonical,
      },
    ],
  };

  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${canonical}#webpage`,
    name: ogTitle,
    description,
    url: canonical,
    isPartOf: { '@id': `${BASE_URL}/#website` },
    breadcrumb: { '@id': `${canonical}#breadcrumb` },
    ...(industry && { about: { '@id': `${canonical}#service` } }),
  };

  const faqSchema =
    industryFaqs && industryFaqs.length > 0
      ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        '@id': `${canonical}#faq`,
        mainEntity: industryFaqs.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      }
      : null;

  const serviceSchema =
    industry && location
      ? {
        '@context': 'https://schema.org',
        '@type': 'Service',
        '@id': `${canonical}#service`,
        name: `${industry} AI Solutions — ${location}`,
        description,
        url: canonical,
        areaServed: { '@type': 'Place', name: location },
        provider: { '@id': `${BASE_URL}/#organization` },
        serviceType: 'Managed AI Hosting',
        category: industry,
      }
      : null;

  return {
    title: ogTitle,
    description,
    keywords: keywords.join(', '),
    canonical,
    ogTitle,
    ogDescription: description,
    ogUrl: canonical,
    ogImage: `${BASE_URL}/og-image.png`,
    breadcrumbSchema,
    webPageSchema,
    faqSchema,
    serviceSchema,
  };
}

