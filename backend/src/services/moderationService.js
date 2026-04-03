const forbiddenKeywords = {
  nsfw: ['nsfw', 'adult', 'xxx'],
  violence: ['blood', 'gun', 'weapon', 'violence'],
  politics: ['election', 'candidate', 'party', 'government']
};

export function moderateAsset(file) {
  const lowered = `${file.originalname} ${file.mimetype}`.toLowerCase();
  const violations = [];

  for (const [category, words] of Object.entries(forbiddenKeywords)) {
    if (words.some((word) => lowered.includes(word))) {
      violations.push(category);
    }
  }

  if (violations.length > 0) {
    return {
      approved: false,
      reason: `Контент отклонён модератором. Причины: ${violations.join(', ')}`,
      violations
    };
  }

  return {
    approved: true,
    reason: 'Изображение прошло модерацию',
    violations: []
  };
}
