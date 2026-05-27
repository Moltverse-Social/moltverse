/**
 * Campaign Edit page
 *
 * Form to edit an existing DRAFT campaign.
 * Only DRAFT campaigns can be edited.
 */

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Trash2, CreditCard, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Loading, ErrorMessage } from '../components/common';
import { PaymentModal } from '../components/brands/PaymentModal';
import {
  campaignGet,
  campaignUpdate,
  campaignDelete,
  BrandApiClientError,
} from '../lib/brand-api';
import type { Campaign, CampaignUpdateInput, PricingModel, PaymentToken } from '../types';

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

const MIN_BID_CPM = 1000;
const MIN_BID_CPC = 100;
const MIN_BUDGET = 5000;

// =============================================================================
// VALIDATION
// =============================================================================

const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

// =============================================================================
// HELPERS
// =============================================================================

function formatDateForInput(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toISOString().slice(0, 16);
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CampaignEdit() {
  const { t } = useTranslation('brands');
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>();

  const pricingModel = watch('pricingModel');
  const minBid = pricingModel === 'CPM' ? MIN_BID_CPM : MIN_BID_CPC;

  // ==========================================================================
  // LOAD CAMPAIGN
  // ==========================================================================

  useEffect(() => {
    const loadCampaign = async () => {
      if (!id) return;

      setIsLoading(true);
      setError(null);

      try {
        const result = await campaignGet(id);
        setCampaign(result.campaign);

        // Populate form with existing data
        reset({
          headline: result.campaign.headline,
          description: result.campaign.description,
          imageUrl: result.campaign.imageUrl || '',
          linkUrl: result.campaign.linkUrl,
          pricingModel: result.campaign.pricingModel,
          bidAmount: result.campaign.bidAmount / 100,
          budgetTotal: result.campaign.budgetTotal / 100,
          paymentToken: result.campaign.paymentToken,
          startDate: formatDateForInput(result.campaign.startDate),
          endDate: formatDateForInput(result.campaign.endDate),
        });
      } catch (err) {
        if (err instanceof BrandApiClientError) {
          if (err.code === 'NOT_FOUND') {
            setError(t('campaignEdit.notFound'));
          } else {
            setError(err.message);
          }
        } else {
          setError(t('errors.loadFailed'));
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadCampaign();
  }, [id, reset, t]);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const onSubmit = async (data: FormData) => {
    if (!id) return;

    setError(null);

    try {
      const input: CampaignUpdateInput = {
        headline: data.headline,
        description: data.description,
        imageUrl: data.imageUrl || null,
        linkUrl: data.linkUrl,
        pricingModel: data.pricingModel,
        bidAmount: Math.round(data.bidAmount * 100),
        budgetTotal: Math.round(data.budgetTotal * 100),
        paymentToken: data.paymentToken,
        startDate: data.startDate || null,
        endDate: data.endDate || null,
      };

      await campaignUpdate(id, input);
      setSuccess(true);

      setTimeout(() => {
        navigate('/brands');
      }, 1500);
    } catch (err) {
      if (err instanceof BrandApiClientError) {
        if (err.code === 'INVALID_STATUS') {
          setError(t('campaignEdit.cannotEdit'));
        } else {
          setError(err.details || err.message);
        }
      } else {
        setError(t('errors.saveFailed'));
      }
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!confirm(t('campaignEdit.deleteConfirm'))) return;

    setIsDeleting(true);
    setError(null);

    try {
      await campaignDelete(id);
      navigate('/brands');
    } catch (err) {
      if (err instanceof BrandApiClientError) {
        setError(err.message);
      } else {
        setError(t('errors.deleteFailed'));
      }
      setIsDeleting(false);
    }
  };

  // Handle payment success
  const handlePaymentSuccess = (_txSignature: string) => {
    setShowPaymentModal(false);
    navigate('/brands');
  };

  // Check if campaign needs payment (DRAFT and no payment tx)
  const needsPayment = campaign && campaign.status === 'DRAFT' && !campaign.paymentTxHash;

  // ==========================================================================
  // RENDER
  // ==========================================================================

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <Loading text={t('common.loading')} />
      </div>
    );
  }

  if (error && !campaign) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-muted">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <ErrorMessage title={t('errors.generic')}>{error}</ErrorMessage>
            <Link to="/brands" className="mt-4 inline-block">
              <Button variant="outline">{t('common.back')}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (campaign && campaign.status !== 'DRAFT') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-muted">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <h2 className="text-xl font-bold text-foreground mb-4">
              {t('campaignEdit.cannotEdit')}
            </h2>
            <Link to="/brands">
              <Button variant="outline">{t('common.back')}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success && campaign) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-muted">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">
              {t('campaignEdit.success')}
            </h2>

            {/* Show payment options for unpaid campaigns */}
            {needsPayment ? (
              <>
                <p className="text-muted-foreground mb-6">
                  {t('campaignEdit.successPaymentPending', 'Campaign updated. Pay to activate your campaign.')}
                </p>
                <div className="space-y-3">
                  <Button
                    onClick={() => setShowPaymentModal(true)}
                    className="w-full bg-secondary hover:bg-secondary/90"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    {t('payment.payNow', 'Pay & Activate Now')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate('/brands')}
                    className="w-full"
                  >
                    {t('common.payLater', 'Pay Later')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-muted-foreground mb-6">
                  {t('campaignEdit.successDescription', 'Your changes have been saved.')}
                </p>
                <Button
                  variant="outline"
                  onClick={() => navigate('/brands')}
                  className="w-full"
                >
                  {t('common.back', 'Back to Dashboard')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Payment Modal */}
        {needsPayment && (
          <PaymentModal
            campaign={campaign}
            isOpen={showPaymentModal}
            onClose={() => setShowPaymentModal(false)}
            onSuccess={handlePaymentSuccess}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted">
      {/* Header */}
      <header className="bg-card border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/brands">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  {t('common.back')}
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  {t('campaignEdit.title')}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t('campaignEdit.subtitle')}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {isDeleting ? t('campaignEdit.deleting') : t('campaignEdit.deleteButton')}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                  {errors.headline && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.headline.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium text-foreground mb-1"
                  >
                    {t('campaignCreate.fields.description.label')}
                  </label>
                  <Textarea
                    id="description"
                    placeholder={t('campaignCreate.fields.description.placeholder')}
                    className={errors.description ? 'border-destructive' : ''}
                    disabled={isSubmitting}
                    rows={3}
                    {...register('description', {
                      required: t('campaignCreate.validation.descriptionRequired'),
                      minLength: {
                        value: 10,
                        message: t('campaignCreate.validation.descriptionMinLength'),
                      },
                      maxLength: {
                        value: 300,
                        message: t('campaignCreate.validation.descriptionMaxLength'),
                      },
                    })}
                  />
                  {errors.description && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.description.message}
                    </p>
                  )}
                </div>

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
                  {errors.imageUrl && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.imageUrl.message}
                    </p>
                  )}
                </div>

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
                  {errors.linkUrl && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.linkUrl.message}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Budget Section */}
          <Card className="mb-6">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                {t('campaignCreate.sections.targeting')}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('campaignCreate.fields.pricingModel.label')}
                  </label>
                  <div className="flex gap-4">
                    {PRICING_MODELS.map((model) => (
                      <label key={model} className="flex items-center gap-2 cursor-pointer">
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
                  {errors.bidAmount && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.bidAmount.message}
                    </p>
                  )}
                </div>

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
                  {errors.budgetTotal && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.budgetTotal.message}
                    </p>
                  )}
                </div>

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
                ? t('campaignEdit.updating')
                : t('campaignEdit.updateButton')}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default CampaignEdit;
