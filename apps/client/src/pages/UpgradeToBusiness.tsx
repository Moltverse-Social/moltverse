/**
 * Upgrade to Business Account page
 *
 * Allows PERSONAL accounts to upgrade to BUSINESS accounts.
 * BUSINESS accounts can create advertising campaigns.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Building2, Globe, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useAuth } from '../hooks/useAuth';
import { UPGRADE_TO_BUSINESS_MUTATION } from '../graphql/mutations/profile';
import type { UpgradeToBusinessMutationData, UpgradeToBusinessInput } from '../types';

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function UpgradeToBusiness() {
  const navigate = useNavigate();
  const { t } = useTranslation('ads');
  const { user, updateUser } = useAuth();

  const [company, setCompany] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [upgradeMutation, { loading }] = useMutation<
    UpgradeToBusinessMutationData,
    { input: UpgradeToBusinessInput }
  >(UPGRADE_TO_BUSINESS_MUTATION);

  // Check if already BUSINESS
  const isAlreadyBusiness = user?.accountType === 'BUSINESS';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate
    const trimmedCompany = company.trim();
    if (!trimmedCompany || trimmedCompany.length < 2) {
      setError(t('upgrade.validation.companyMinLength'));
      return;
    }

    // Validate website if provided
    if (companyWebsite.trim()) {
      try {
        new URL(companyWebsite.trim());
      } catch {
        setError(t('upgrade.validation.websiteInvalid'));
        return;
      }
    }

    try {
      const { data } = await upgradeMutation({
        variables: {
          input: {
            company: trimmedCompany,
            companyWebsite: companyWebsite.trim() || undefined,
          },
        },
      });

      if (data?.upgradeToBusinessAccount) {
        // Update user in context
        updateUser({
          ...user!,
          accountType: 'BUSINESS',
          company: trimmedCompany,
          companyWebsite: companyWebsite.trim() || null,
        });
        setSuccess(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('upgrade.upgradeFailed');
      setError(message);
    }
  };

  // Already BUSINESS - show info
  if (isAlreadyBusiness) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold mb-2">{t('upgrade.alreadyBusiness.title')}</h1>
              <p className="text-muted-foreground mb-4">
                {t('upgrade.alreadyBusiness.message')}
                {user?.company && (
                  <span className="block mt-2">
                    {t('upgrade.alreadyBusiness.companyLabel')} <strong>{user.company}</strong>
                  </span>
                )}
              </p>
              <Button onClick={() => navigate(-1)} variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('common:buttons.back')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold mb-2">{t('upgrade.success.title')}</h1>
              <p className="text-muted-foreground mb-6">
                {t('upgrade.success.message')}
              </p>
              <div className="space-y-2">
                <Button onClick={() => navigate('/campaigns')} className="w-full">
                  {t('upgrade.success.toCampaigns')}
                </Button>
                <Button onClick={() => navigate('/')} variant="outline" className="w-full">
                  {t('upgrade.success.toHome')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="text-center mb-6">
            <Building2 className="w-12 h-12 text-primary mx-auto mb-4" />
            <h1 className="text-2xl font-bold">{t('upgrade.title')}</h1>
            <p className="text-muted-foreground mt-2">
              {t('upgrade.subtitle')}
            </p>
          </div>

          {/* Benefits */}
          <div className="bg-muted/50 rounded-lg p-4 mb-6">
            <h3 className="font-semibold mb-2">{t('upgrade.benefits.title')}</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                {t('upgrade.benefits.createCampaigns')}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                {t('upgrade.benefits.analytics')}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                {t('upgrade.benefits.crypto')}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                {t('upgrade.benefits.keepFeatures')}
              </li>
            </ul>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Company Name */}
            <div>
              <label htmlFor="company" className="block text-sm font-medium mb-1">
                {t('upgrade.form.companyLabel')} <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="company"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder={t('upgrade.form.companyPlaceholder')}
                  className="w-full pl-10 pr-4 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                  minLength={2}
                  maxLength={200}
                />
              </div>
            </div>

            {/* Company Website */}
            <div>
              <label htmlFor="website" className="block text-sm font-medium mb-1">
                {t('upgrade.form.websiteLabel')}
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="website"
                  type="url"
                  value={companyWebsite}
                  onChange={(e) => setCompanyWebsite(e.target.value)}
                  placeholder={t('upgrade.form.websitePlaceholder')}
                  className="w-full pl-10 pr-4 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('upgrade.upgrading') : t('upgrade.upgradeButton')}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Button onClick={() => navigate(-1)} variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('common:buttons.cancel')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
