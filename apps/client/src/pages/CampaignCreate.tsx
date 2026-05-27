/**
 * Campaign Create page
 *
 * Form to create a new advertising campaign.
 * Campaigns are created in DRAFT status.
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CreditCard } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { ErrorMessage } from '../components/common';
import { PaymentModal } from '../components/brands/PaymentModal';
import { campaignCreate, BrandApiClientError } from '../lib/brand-api';
import type { Campaign, CampaignCreateInput, PricingModel, PaymentToken } from '../types';

// =============================================================================
// TYPES
// =============================================================================

interface FormData {
  headline: string;
  description: string;
  imageUrl?: string;
  linkUrl: string;
  pricingModel: PricingModel;
  bidAmount: number;
  budgetTotal: number;
  paymentToken: PaymentToken;
  startDate?: string;
  endDate?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const PRICING_MODELS: PricingModel[] = ['CPM', 'CPC'];
const PAYMENT_TOKENS: { value: PaymentToken; discount: number }[] = [
  { value: 'MOLTVERSE', discount: 20 },
  { value: 'PUMP', discount: 10 },
  { value: 'SOL', discount: 0 },
  { value: 'USDC', discount: 0 },
];

const MIN_BID_CPM = 1000; // $10.00 in cents
const MIN_BID_CPC = 100; // $1.00 in cents
const MIN_BUDGET = 5000; // $50.00 in cents

// =============================================================================
// VALIDATION
// =============================================================================

const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

// =============================================================================
// COMPONENT
// =============================================================================

export function CampaignCreate() {
  const { t } = useTranslation('brands');
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [createdCampaign, setCreatedCampaign] = useState<Campaign | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    defaultValues: {
      pricingModel: 'CPM',
      paymentToken: 'USDC',
      bidAmount: 10,
      budgetTotal: 50,
    },
  });

  const pricingModel = watch('pricingModel');
  const minBid = pricingModel === 'CPM' ? MIN_BID_CPM : MIN_BID_CPC;

  const onSubmit = async (data: FormData) => {
    setError(null);

    try {
      const input: CampaignCreateInput = {
        headline: data.headline,
        description: data.description,
        imageUrl: data.imageUrl || undefined,
        linkUrl: data.linkUrl,
        pricingModel: data.pricingModel,
        bidAmount: Math.round(data.bidAmount * 100), // Convert to cents
        budgetTotal: Math.round(data.budgetTotal * 100), // Convert to cents
        paymentToken: data.paymentToken,
        startDate: data.startDate || undefined,
        endDate: data.endDate || undefined,
      };

      const response = await campaignCreate(input);
      setCreatedCampaign(response.campaign);
    } catch (err) {
      if (err instanceof BrandApiClientError) {
        setError(err.details || err.message);
      } else {
        setError(t('errors.saveFailed'));
      }
    }
  };

  // Handle payment success
  const handlePaymentSuccess = (_txSignature: string) => {
    setShowPaymentModal(false);
    navigate('/brands');
  };

  // Show success screen with payment option
  if (createdCampaign) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-muted">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-green-600 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">
              {t('campaignCreate.success')}
            </h2>
            <p className="text-muted-foreground mb-6">
              {t('campaignCreate.successDescription')}
            </p>

            {/* Payment Options */}
            <div className="space-y-3">
              <Button
                onClick={() => setShowPaymentModal(true)}
                className="w-full bg-secondary hover:bg-secondary/90"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                {t('payment.paymentRequired', 'Pay & Activate Now')}
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/brands')}
                className="w-full"
              >
                {t('common.back', 'Back to Dashboard')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Payment Modal */}
        <PaymentModal
          campaign={createdCampaign}
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={handlePaymentSuccess}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted">
      {/* Header */}
      <header className="bg-card border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link to="/brands">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('common.back')}
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                {t('campaignCreate.title')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t('campaignCreate.subtitle')}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error */}
        {error && (
          <div className="mb-6">
            <ErrorMessage title={t('errors.generic')}>{error}</ErrorMessage>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Creative Section */}
          <Card className="mb-6">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                {t('campaignCreate.sections.creative')}
              </h3>

              <div className="space-y-4">
                {/* Headline */}
                <div>
                  <label
                    htmlFor="headline"
                    className="block text-sm font-medium text-foreground mb-1"
                  >
                    {t('campaignCreate.fields.headline.label')}
                  </label>
                  <Input
                    id="headline"
                    placeholder={t('campaignCreate.fields.headline.placeholder')}
                    className={errors.headline ? 'border-destructive' : ''}
                    disabled={isSubmitting}
                    {...register('headline', {
                      required: t('campaignCreate.validation.headlineRequired'),
                      minLength: {
                        value: 3,
                        message: t('campaignCreate.validation.headlineMinLength'),
                      },
                      maxLength: {
                        value: 100,
                        message: t('campaignCreate.validation.headlineMaxLength'),
                      },
                    })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('campaignCreate.fields.headline.help')}
                  </p>
                  {errors.headline && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.headline.message}
                    </p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium text-foreground mb-1"
                  >
                    {t('campaignCreate.fields.description.label')}
                  </label>
                  <Textarea
                    id="description"
                    placeholder={t(
                      'campaignCreate.fields.description.placeholder'
                    )}
                    className={errors.description ? 'border-destructive' : ''}
                    disabled={isSubmitting}
                    rows={3}
                    {...register('description', {
                      required: t(
                        'campaignCreate.validation.descriptionRequired'
                      ),
                      minLength: {
                        value: 10,
                        message: t(
                          'campaignCreate.validation.descriptionMinLength'
                        ),
                      },
                      maxLength: {
                        value: 300,
                        message: t(
                          'campaignCreate.validation.descriptionMaxLength'
                        ),
                      },
                    })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('campaignCreate.fields.description.help')}
                  </p>
                  {errors.description && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.description.message}
                    </p>
                  )}
                </div>

                {/* Image URL (optional) */}
                <div>
                  <label
                    htmlFor="imageUrl"
                    className="block text-sm font-medium text-foreground mb-1"
                  >
                    {t('campaignCreate.fields.imageUrl.label')}
                  </label>
                  <Input
                    id="imageUrl"
                    type="url"
                    placeholder="https://res.cloudinary.com/..."
                    className={errors.imageUrl ? 'border-destructive' : ''}
                    disabled={isSubmitting}
                    {...register('imageUrl', {
                      pattern: {
                        value: URL_REGEX,
                        message: t('campaignCreate.validation.linkUrlInvalid'),
                      },
                    })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('campaignCreate.fields.imageUrl.help')}
                  </p>
                  {errors.imageUrl && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.imageUrl.message}
                    </p>
                  )}
                </div>

                {/* Link URL */}
                <div>
                  <label
                    htmlFor="linkUrl"
                    className="block text-sm font-medium text-foreground mb-1"
                  >
                    {t('campaignCreate.fields.linkUrl.label')}
                  </label>
                  <Input
                    id="linkUrl"
                    type="url"
                    placeholder={t('campaignCreate.fields.linkUrl.placeholder')}
                    className={errors.linkUrl ? 'border-destructive' : ''}
                    disabled={isSubmitting}
                    {...register('linkUrl', {
                      required: t('campaignCreate.validation.linkUrlRequired'),
                      pattern: {
                        value: URL_REGEX,
                        message: t('campaignCreate.validation.linkUrlInvalid'),
                      },
                    })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('campaignCreate.fields.linkUrl.help')}
                  </p>
                  {errors.linkUrl && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.linkUrl.message}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Targeting & Budget Section */}
          <Card className="mb-6">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                {t('campaignCreate.sections.targeting')}
              </h3>

              <div className="space-y-4">
                {/* Pricing Model */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('campaignCreate.fields.pricingModel.label')}
                  </label>
                  <div className="flex gap-4">
                    {PRICING_MODELS.map((model) => (
                      <label
                        key={model}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="radio"
                          value={model}
                          className="text-secondary focus:ring-secondary"
                          disabled={isSubmitting}
                          {...register('pricingModel')}
                        />
                        <span className="text-sm text-foreground">
                          {t(`campaignCreate.fields.pricingModel.${model.toLowerCase()}`)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Bid Amount */}
                <div>
                  <label
                    htmlFor="bidAmount"
                    className="block text-sm font-medium text-foreground mb-1"
                  >
                    {t('campaignCreate.fields.bidAmount.label')}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="bidAmount"
                      type="number"
                      step="0.01"
                      min={minBid / 100}
                      className={`pl-7 ${errors.bidAmount ? 'border-destructive' : ''}`}
                      disabled={isSubmitting}
                      {...register('bidAmount', {
                        required: t('campaignCreate.validation.bidAmountRequired'),
                        min: {
                          value: minBid / 100,
                          message: t('campaignCreate.validation.bidAmountMin', {
                            min: (minBid / 100).toFixed(2),
                          }),
                        },
                        valueAsNumber: true,
                      })}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('campaignCreate.fields.bidAmount.help')} (
                    {pricingModel === 'CPM'
                      ? t('campaignCreate.fields.bidAmount.perThousand')
                      : t('campaignCreate.fields.bidAmount.perClick')}
                    )
                  </p>
                  {errors.bidAmount && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.bidAmount.message}
                    </p>
                  )}
                </div>

                {/* Budget Total */}
                <div>
                  <label
                    htmlFor="budgetTotal"
                    className="block text-sm font-medium text-foreground mb-1"
                  >
                    {t('campaignCreate.fields.budgetTotal.label')}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="budgetTotal"
                      type="number"
                      step="0.01"
                      min={MIN_BUDGET / 100}
                      placeholder={t(
                        'campaignCreate.fields.budgetTotal.placeholder'
                      )}
                      className={`pl-7 ${errors.budgetTotal ? 'border-destructive' : ''}`}
                      disabled={isSubmitting}
                      {...register('budgetTotal', {
                        required: t('campaignCreate.validation.budgetRequired'),
                        min: {
                          value: MIN_BUDGET / 100,
                          message: t('campaignCreate.validation.budgetMin'),
                        },
                        valueAsNumber: true,
                      })}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('campaignCreate.fields.budgetTotal.help')}
                  </p>
                  {errors.budgetTotal && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.budgetTotal.message}
                    </p>
                  )}
                </div>

                {/* Payment Token */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('campaignCreate.fields.paymentToken.label')}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {PAYMENT_TOKENS.map(({ value, discount }) => (
                      <label
                        key={value}
                        className="flex flex-col items-center p-3 border rounded-lg cursor-pointer hover:border-secondary transition-colors"
                      >
                        <input
                          type="radio"
                          value={value}
                          className="sr-only"
                          disabled={isSubmitting}
                          {...register('paymentToken')}
                        />
                        <span className="text-sm font-medium text-foreground">
                          {t(`tokens.${value.toLowerCase()}`)}
                        </span>
                        {discount > 0 && (
                          <span className="text-xs text-green-600 dark:text-green-400">
                            {t('campaignCreate.fields.paymentToken.discount', {
                              percent: discount,
                            })}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('campaignCreate.fields.paymentToken.help')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Schedule Section */}
          <Card className="mb-6">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                {t('campaignCreate.sections.schedule')}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Start Date */}
                <div>
                  <label
                    htmlFor="startDate"
                    className="block text-sm font-medium text-foreground mb-1"
                  >
                    {t('campaignCreate.fields.startDate.label')}
                  </label>
                  <Input
                    id="startDate"
                    type="datetime-local"
                    disabled={isSubmitting}
                    {...register('startDate')}
                  />
                </div>

                {/* End Date */}
                <div>
                  <label
                    htmlFor="endDate"
                    className="block text-sm font-medium text-foreground mb-1"
                  >
                    {t('campaignCreate.fields.endDate.label')}
                  </label>
                  <Input
                    id="endDate"
                    type="datetime-local"
                    disabled={isSubmitting}
                    {...register('endDate')}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end gap-4">
            <Link to="/brands">
              <Button variant="outline" disabled={isSubmitting}>
                {t('common.cancel')}
              </Button>
            </Link>
            <Button
              type="submit"
              className="bg-secondary hover:bg-secondary/90"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? t('campaignCreate.creating')
                : t('campaignCreate.createButton')}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default CampaignCreate;
